import { readFile, readdir } from "fs/promises";
import path from "path";
import { classifyProcurementDocument } from "@/lib/procurementDocumentGroups";
import { zakupkiFetch } from "@/lib/zakupkiQueue";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const CACHE_DIR = path.join(process.cwd(), "data", "tz-cache");

export interface StoredProcurementDocument {
  name: string;
  url?: string | null;
  format?: string;
  parsed?: boolean;
  specCount?: number;
  sizeBytes?: number;
  cachedPath?: string | null;
}

export function isArchiveFileName(name: string): boolean {
  return /\.(zip|rar|7z)$/i.test(name);
}

export function normalizeDocNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|zip|rar|7z|rtf|html?)$/i, "")
    .replace(/[^\p{L}\d]+/gu, " ")
    .trim();
}

/** Те же документы, что показывает TenderDocumentsPanel */
export function listProcurementDocuments(requirements: Record<string, unknown>): StoredProcurementDocument[] {
  const tz = requirements.tzDocuments;
  if (Array.isArray(tz) && tz.length > 0) {
    return tz as StoredProcurementDocument[];
  }
  const tender = requirements.tenderDocuments;
  if (Array.isArray(tender) && tender.length > 0) {
    return tender.map((raw) => {
      const t = raw as { name?: string; url?: string; format?: string };
      return {
        name: typeof t.name === "string" ? t.name : "Документ",
        url: typeof t.url === "string" ? t.url : null,
        format: typeof t.format === "string" ? t.format : undefined,
      };
    });
  }
  return [];
}

/** Плейсхолдеры заменяем реальным списком с ЕИС */
function mergeStoredWithEisDocuments(
  stored: StoredProcurementDocument[],
  eis: StoredProcurementDocument[]
): StoredProcurementDocument[] {
  if (eis.length === 0) return stored;
  if (!stored.some((d) => d.url || d.cachedPath)) return eis;

  const byUrl = new Map<string, StoredProcurementDocument>();
  const byNormName = new Map<string, StoredProcurementDocument>();
  for (const d of stored) {
    if (d.url) byUrl.set(d.url, d);
    byNormName.set(normalizeDocNameForMatch(d.name), d);
  }

  return eis.map((e) => {
    const match = (e.url ? byUrl.get(e.url) : undefined) ?? byNormName.get(normalizeDocNameForMatch(e.name));
    if (!match) return e;
    return {
      ...e,
      cachedPath: match.cachedPath ?? e.cachedPath,
      parsed: match.parsed ?? e.parsed,
      specCount: match.specCount ?? e.specCount,
      sizeBytes: match.sizeBytes ?? e.sizeBytes,
    };
  });
}

export async function listProcurementDocumentsResolved(
  requirements: Record<string, unknown>,
  externalId: string
): Promise<StoredProcurementDocument[]> {
  const stored = listProcurementDocuments(requirements);

  const { listTenderEisAttachmentsCached } = await import("@/lib/zakupkiDocuments");
  const noticeType = noticeTypeFromRequirements(requirements);
  const eis = await listTenderEisAttachmentsCached(externalId, noticeType);
  if (eis.length > 0) return mergeStoredWithEisDocuments(stored, eis);
  return stored;
}

export function findProcurementDocument(
  docs: StoredProcurementDocument[],
  name: string
): StoredProcurementDocument | null {
  if (docs.length === 0) return null;
  if (!name.trim()) return docs[0];

  const exact = docs.find((d) => d.name === name);
  if (exact) return exact;

  const norm = normalizeDocNameForMatch(name);
  const byNorm = docs.find((d) => normalizeDocNameForMatch(d.name) === norm);
  if (byNorm) return byNorm;

  const partial = docs.find(
    (d) =>
      normalizeDocNameForMatch(d.name).includes(norm) ||
      norm.includes(normalizeDocNameForMatch(d.name))
  );
  if (partial) return partial;

  const group = classifyProcurementDocument(name);
  return docs.find((d) => classifyProcurementDocument(d.name) === group) ?? null;
}

export function contentTypeByExt(ext: string): string {
  switch (ext) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "7z":
      return "application/x-7z-compressed";
    default:
      return "application/octet-stream";
  }
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
}

export async function fetchZakupkiDocument(url: string): Promise<Buffer> {
  const response = await zakupkiFetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (!buf.length) throw new Error("empty_file");
  return buf;
}

function scoreCacheEntryMatch(entry: string, externalId: string, docName: string): number {
  const display = entry
    .replace(new RegExp(`^${externalId}_`), "")
    .replace(/_/g, " ");
  const normWanted = normalizeDocNameForMatch(docName);
  const normEntry = normalizeDocNameForMatch(display);
  let score = 0;
  if (normEntry === normWanted) score = 100;
  else if (normEntry.includes(normWanted) || normWanted.includes(normEntry)) score = 75;
  else if (classifyProcurementDocument(docName) === classifyProcurementDocument(display)) score = 55;

  const extWanted = docName.match(/\.(\w+)$/i)?.[1]?.toLowerCase();
  if (extWanted && entry.toLowerCase().endsWith("." + extWanted)) score += 10;

  return score;
}

export async function tryReadCachedFile(
  externalId: string,
  docName: string
): Promise<{ buf: Buffer; fileName: string } | null> {
  const cacheDir = path.join(CACHE_DIR, externalId);

  try {
    const entries = await readdir(cacheDir);
    const eligible = entries.filter((e) => e.startsWith(externalId + "_"));
    if (eligible.length === 0) return null;

    let best: { entry: string; score: number } | null = null;
    for (const entry of eligible) {
      const score = scoreCacheEntryMatch(entry, externalId, docName);
      if (!best || score > best.score) best = { entry, score };
    }

    if (!best || best.score < 40) {
      if (eligible.length === 1) best = { entry: eligible[0], score: 30 };
      else return null;
    }

    const p = path.join(cacheDir, best.entry);
    const buf = await readFile(p);
    if (!buf || buf.length === 0) return null;

    const ext = best.entry.match(/\.(\w+)$/i)?.[1];
    let fileName = safeFileName(docName);
    if (ext && !fileName.toLowerCase().endsWith("." + ext.toLowerCase())) {
      fileName = `${fileName.replace(/\.[^.]+$/, "")}.${ext}`;
    }

    return { buf, fileName };
  } catch {
    return null;
  }
}

/** Один архив в кэше — отдаём как есть, без перепаковки */
export async function tryReadSingleArchiveFromCache(
  externalId: string
): Promise<{ buf: Buffer; fileName: string } | null> {
  const cacheDir = path.join(CACHE_DIR, externalId);
  try {
    const entries = await readdir(cacheDir);
    const archives = entries.filter(
      (e) => e.startsWith(externalId + "_") && isArchiveFileName(e)
    );
    if (archives.length !== 1) return null;
    const p = path.join(cacheDir, archives[0]);
    const buf = await readFile(p);
    if (!buf.length) return null;
    const display = archives[0]
      .replace(new RegExp(`^${externalId}_`), "")
      .replace(/_/g, " ");
    return { buf, fileName: safeFileName(display.includes(".") ? display : `${display}.zip`) };
  } catch {
    return null;
  }
}

export async function resolveProcurementDocumentBuffer(
  externalId: string,
  doc: StoredProcurementDocument,
  options: { noticeType?: string } = {}
): Promise<{ buf: Buffer; fileName: string } | null> {
  if (doc.cachedPath) {
    try {
      const buf = await readFile(doc.cachedPath);
      if (buf.length > 0) {
        const ext = doc.cachedPath.match(/\.(\w+)$/i)?.[1];
        let fileName = safeFileName(doc.name);
        if (ext && !fileName.toLowerCase().endsWith("." + ext.toLowerCase())) {
          fileName = `${fileName.replace(/\.[^.]+$/, "")}.${ext}`;
        }
        return { buf, fileName };
      }
    } catch {
      // fallback
    }
  }

  const cached = await tryReadCachedFile(externalId, doc.name);
  if (cached) return cached;

  if (doc.url) {
    try {
      const buf = await fetchZakupkiDocument(doc.url);
      const ext = doc.format || doc.name.match(/\.(\w+)$/i)?.[1] || "bin";
      let fileName = safeFileName(doc.name);
      if (!fileName.includes(".") && ext) fileName = `${fileName}.${ext}`;
      return { buf, fileName };
    } catch {
      // lazy fetch below
    }
  }

  if (options.noticeType) {
    try {
      const { fetchTenderAttachment } = await import("@/lib/zakupkiDocuments");
      const fetched = await fetchTenderAttachment(externalId, options.noticeType, doc.name);
      if (fetched) {
        let fileName = safeFileName(fetched.fileName);
        if (!fileName.includes(".") && fetched.format) {
          fileName = `${fileName}.${fetched.format}`;
        }
        return { buf: fetched.buffer, fileName };
      }
    } catch (e) {
      console.error(`[procurement] lazy fetch ${externalId} "${doc.name}":`, e);
    }
  }

  return null;
}

export function noticeTypeFromRequirements(requirements: Record<string, unknown>): string {
  const raw = requirements.noticeType;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "ea20";
}

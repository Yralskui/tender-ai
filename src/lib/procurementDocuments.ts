import { readFile, readdir } from "fs/promises";
import path from "path";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface StoredProcurementDocument {
  name: string;
  url?: string | null;
  format?: string;
  parsed?: boolean;
  specCount?: number;
  sizeBytes?: number;
  cachedPath?: string | null;
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
    default:
      return "application/octet-stream";
  }
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
}

export async function fetchZakupkiDocument(url: string): Promise<Buffer> {
  const response = await fetch(url, {
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

export async function tryReadCachedFile(
  externalId: string,
  docName: string
): Promise<{ buf: Buffer; fileName: string } | null> {
  const cacheDir = path.join(process.cwd(), "data", "tz-cache", externalId);
  const ext = docName.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "";
  const base = docName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\d]+/gu, "_")
    .toLowerCase()
    .slice(0, 40);

  try {
    const entries = await readdir(cacheDir);
    const candidates = entries
      .filter((e) => (ext ? e.toLowerCase().endsWith("." + ext) : true))
      .filter((e) => e.startsWith(externalId + "_"));

    const preferred =
      candidates.find((e) => (base ? e.toLowerCase().includes(base) : false)) || candidates[0];
    if (!preferred) return null;
    const p = path.join(cacheDir, preferred);
    const buf = await readFile(p);
    if (!buf || buf.length === 0) return null;
    return {
      buf,
      fileName: safeFileName(docName || preferred.replace(new RegExp(`^${externalId}_`), "")),
    };
  } catch {
    return null;
  }
}

export async function resolveProcurementDocumentBuffer(
  externalId: string,
  doc: StoredProcurementDocument
): Promise<{ buf: Buffer; fileName: string } | null> {
  if (doc.cachedPath) {
    try {
      const buf = await readFile(doc.cachedPath);
      if (buf.length > 0) return { buf, fileName: safeFileName(doc.name) };
    } catch {
      // fallback
    }
  }

  const cached = await tryReadCachedFile(externalId, doc.name);
  if (cached) return cached;

  if (doc.url) {
    try {
      const buf = await fetchZakupkiDocument(doc.url);
      return { buf, fileName: safeFileName(doc.name) };
    } catch {
      return null;
    }
  }

  return null;
}

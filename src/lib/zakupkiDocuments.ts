/**
 * Загрузка и разбор вложений ТЗ с zakupki.gov.ru (documents.html → filestore).
 */

import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { extractTextFromOfficeBuffer, unwrapOfficeArchive } from "@/lib/officeText";
import { isNmckExcelName, isNmckJustificationDocxName, parseNmckExcelProducts, parseNmckDocxProducts, type NmckLineItem } from "@/lib/nmckExcelParser";
import {
  mergeNmckAndOoz,
  parseDocumentAttachment,
  enrichParseWithEisCatalog,
  type DocumentParseResult,
} from "@/lib/tzDocumentParse";
import { classifyProcurementDocument } from "@/lib/procurementDocumentGroups";
import { isPlaceholderPositionName, looksLikeProductName } from "@/lib/tzSanitizer";

export { classifyProcurementDocument, DOCUMENT_GROUP_LABELS } from "@/lib/procurementDocumentGroups";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const CACHE_DIR = path.join(process.cwd(), "data", "tz-cache");

export interface ZakupkiAttachment {
  name: string;
  url: string;
  score: number;
}

export interface ParsedTzDocument {
  name: string;
  url: string;
  format: string;
  sizeBytes: number;
  parsed: boolean;
  specCount: number;
  cachedPath?: string;
}

export interface TzEnrichmentResult {
  productSpecs: string[];
  products: string[];
  technicalAssignment: string;
  ktruCodes: string[];
  documents: ParsedTzDocument[];
  tzParsedFromFile: boolean;
  tzVolumes?: Array<{ name: string; ktruCode?: string; quantity: number; unit: string }>;
}

const TZ_NAME_SCORES: Array<{ re: RegExp; score: number }> = [
  { re: /описание объекта закупки/i, score: 100 },
  { re: /техническ.*задани/i, score: 95 },
  { re: /спецификаци/i, score: 90 },
  { re: /\bтз\b/i, score: 85 },
  { re: /характеристик/i, score: 80 },
  { re: /описание\s+предмета/i, score: 75 },
  { re: /проект\s+контракта/i, score: 5 },
  { re: /пример\)\.docx/i, score: 3 },
  { re: /требовани[яе]\s+к\s+содержанию.*заявк/i, score: 20 },
  { re: /нмцк|обоснован/i, score: 10 },
  { re: /дополнительн/i, score: 15 },
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isContractDocument(name: string): boolean {
  return /проект\s+контракта|типовой\s+договор|договор\s+поставк/i.test(name);
}

function scoreAttachmentName(name: string): number {
  let score = 0;
  for (const { re, score: s } of TZ_NAME_SCORES) {
    if (re.test(name)) score = Math.max(score, s);
  }
  if (isContractDocument(name)) return Math.min(score, 8);

  if (/\.pdf$/i.test(name)) score += 5;
  if (/\.docx?$/i.test(name)) score += 3;
  if (/\.xlsx?$/i.test(name)) {
    if (/описание|тз|характеристик|объект|спецификац|номенклатур|каталог|техническ.*задани/i.test(name)) {
      score = Math.max(score, 88);
    } else {
      score = Math.max(score, 42);
    }
  }
  if (/нмцк/i.test(name)) score = Math.max(score, 12);
  if (isNmckJustificationDocxName(name) || isNmckExcelName(name)) score = Math.max(score, 85);
  return score;
}

function inferExtensionFromContext(ctx: string): string {
  if (/Microsoft Excel|spreadsheet/i.test(ctx)) return ".xlsx";
  if (/Microsoft Word/i.test(ctx)) return ".docx";
  if (/RTF Document/i.test(ctx)) return ".rtf";
  if (/PDF/i.test(ctx)) return ".pdf";
  return ".docx";
}

function extractFileNameFromContext(ctx: string): string {
  const cleaned = stripHtml(ctx);

  // В некоторых извещениях имя файла в title может быть с "????" из-за кодировки,
  // поэтому не требуем, чтобы имя начиналось с [А-ЯA-Za-z0-9].
  const withExt = [
    ...cleaned.matchAll(/([^"'<>\r\n]{4,180}\.(?:pdf|docx?|xlsx?|rtf|zip))/gi),
  ];
  if (withExt.length > 0) {
    return withExt[withExt.length - 1][1].replace(/\s+/g, " ").trim();
  }

  const afterIcon = cleaned.match(
    /(?:Word|Excel|RTF|PDF)\s+Document\s*"?\/>\s*([А-Яа-яA-Za-z0-9«»][^/]{4,120}?)(?:\s+<|\s+div|\s*$)/i
  );
  if (afterIcon) {
    const base = afterIcon[1].replace(/\s+/g, " ").trim();
    if (base.length >= 4) return base + inferExtensionFromContext(cleaned);
  }

  return "document.bin";
}

function normalizeFilestoreUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `https://zakupki.gov.ru${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Парсит documents.html — список вложений filestore */
export function parseDocumentsPageHtml(html: string): ZakupkiAttachment[] {
  const docs: ZakupkiAttachment[] = [];
  const seen = new Set<string>();

  // В разных типах извещений (ea/zk/ok и т.д.) ссылки могут вести как на filestore,
  // так и на download/downloadFile и т.п. Ищем оба типа.
  const re =
    /([\s\S]{0,600})href="([^"]*(?:filestore|download|downloadFile)[^"]+)"([\s\S]{0,260})/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = normalizeFilestoreUrl(m[2]);
    if (seen.has(url)) continue;
    seen.add(url);

    const ctx = m[1] + " " + m[3];
    const name = extractFileNameFromContext(ctx);
    let score = scoreAttachmentName(name);
    // Любой файл с расширением — в список (для скачивания), даже если не парсим.
    if (score <= 0 && /\.(pdf|docx?|xlsx?|rtf|zip|html?)$/i.test(name)) {
      score = 8;
    }
    if (score <= 0) continue;

    docs.push({ name, url, score });
  }

  return docs.sort((a, b) => b.score - a.score);
}

/** Все вложения для скачивания (не только те, что идут в разбор ТЗ). */
function pickAllDownloadableAttachments(attachments: ZakupkiAttachment[], maxDocuments: number): ZakupkiAttachment[] {
  const deduped = dedupeAttachments(attachments);
  return deduped
    .filter((a) => a.name && !/^document\.bin$/i.test(a.name))
    .slice(0, maxDocuments);
}

function pickParseCandidates(attachments: ZakupkiAttachment[], maxDocuments: number): ZakupkiAttachment[] {
  const deduped = dedupeAttachments(attachments);
  const picked: ZakupkiAttachment[] = [];

  const ooz = deduped.find(
    (a) => !isContractDocument(a.name) && /описание объекта закупки|техническ.*задани/i.test(a.name)
  );
  const nmck = deduped.find(
    (a) => !isContractDocument(a.name) && (isNmckExcelName(a.name) || isNmckJustificationDocxName(a.name))
  );
  if (ooz) picked.push(ooz);
  if (nmck && nmck !== ooz) picked.push(nmck);

  const eligible = deduped.filter((a) => !isContractDocument(a.name) && a.score >= 40);
  for (const a of eligible) {
    if (picked.length >= maxDocuments) break;
    if (!picked.includes(a)) picked.push(a);
  }

  return picked.slice(0, maxDocuments);
}

async function readResponseText(response: Response): Promise<string> {
  const textPromise = response.text();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Таймаут загрузки текста ответа")), FETCH_TIMEOUT_MS);
  });
  return Promise.race([textPromise, timeoutPromise]);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
}

function safeCacheFileName(regNumber: string, docName: string): string {
  const ext = docName.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "bin";
  const base = docName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\d]+/gu, "_")
    .slice(0, 60);
  return `${regNumber}_${base || "doc"}.${ext}`;
}

async function readResponseBody(response: Response): Promise<Buffer> {
  const bodyPromise = response.arrayBuffer().then((ab) => Buffer.from(ab));
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Таймаут загрузки тела ответа")), FETCH_TIMEOUT_MS);
  });
  return Promise.race([bodyPromise, timeoutPromise]);
}

async function downloadToCache(regNumber: string, attachment: ZakupkiAttachment): Promise<{
  buffer: Buffer;
  cachedPath: string;
  sizeBytes: number;
} | null> {
  const dir = path.join(CACHE_DIR, regNumber);
  await mkdir(dir, { recursive: true });

  const fileName = safeCacheFileName(regNumber, attachment.name);
  const cachedPath = path.join(dir, fileName);

  try {
    const existing = await readFile(cachedPath);
    if (existing.length > 0 && existing.length <= MAX_FILE_BYTES) {
      return { buffer: existing, cachedPath, sizeBytes: existing.length };
    }
  } catch {
    // cache miss — download
  }

  const response = await fetchWithTimeout(attachment.url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES) {
    throw new Error(`Файл слишком большой (${contentLength} байт)`);
  }

  const buffer = await readResponseBody(response);
  if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    throw new Error(`Недопустимый размер: ${buffer.length}`);
  }

  await writeFile(cachedPath, buffer);
  return { buffer, cachedPath, sizeBytes: buffer.length };
}

function normalizeAttachmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.(docx?|pdf|rtf)$/i, "")
    .trim();
}

function dedupeAttachments(attachments: ZakupkiAttachment[]): ZakupkiAttachment[] {
  const byName = new Map<string, ZakupkiAttachment>();
  for (const a of attachments) {
    const key = normalizeAttachmentName(a.name);
    const prev = byName.get(key);
    if (!prev || a.score > prev.score) byName.set(key, a);
  }
  return [...byName.values()].sort((a, b) => b.score - a.score);
}

function mergeSpecs(htmlSpecs: string[], tzSpecs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const htmlMeta = htmlSpecs.filter(
    (s) => /^КТРУ:/i.test(s) || /регистрационн[ое]+\s+удостоверен/i.test(s)
  );

  for (const spec of [...tzSpecs, ...htmlMeta]) {
    const key = spec.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    const isPosition = /^позиция\s*тз/i.test(key);
    const isCharLine = spec.includes(" — ");
    if (!isPosition && !isCharLine && seen.has(key)) continue;
    if (!isPosition && !isCharLine) seen.add(key);
    result.push(spec);
  }
  return result.slice(0, 300);
}

export interface EnrichTzOptions {
  htmlProductSpecs?: string[];
  htmlTechnicalAssignment?: string;
  htmlKtruCodes?: string[];
  /** Каталог КТРУ с common-info.html (варианты наборов) */
  htmlEisCatalog?: import("@/lib/tzDocumentParse").DocumentParseResult | null;
  /** Сколько файлов разбирать для ТЗ */
  maxDocuments?: number;
  /** Сколько файлов скачать в кэш (все вложения) */
  maxAllDocuments?: number;
  /** Массовый разбор: только 2–3 файла ТЗ, без скачивания всего архива */
  batchLight?: boolean;
  skipDownload?: boolean;
}

function resolveOfficeBuffer(buffer: Buffer): Buffer {
  return unwrapOfficeArchive(buffer)?.buffer ?? buffer;
}

function productNameQuality(result: DocumentParseResult | null): number {
  if (!result?.products?.length) return 0;
  let score = 0;
  for (const name of result.products) {
    if (looksLikeProductName(name) && !isPlaceholderPositionName(name)) score += 12;
    else if (isPlaceholderPositionName(name)) score -= 8;
    else score -= 4;
  }
  return score;
}

function isOozDocumentName(name: string): boolean {
  return /описание|объект\s+закупки|характеристик|техническ.*задани|\bтз\b/i.test(name);
}

function resolveEffectiveTzParse(
  bestOoz: DocumentParseResult | null,
  bestAny: DocumentParseResult | null,
  htmlEis: DocumentParseResult | null = null
): DocumentParseResult | null {
  const candidates = [bestOoz, bestAny, htmlEis].filter(Boolean) as DocumentParseResult[];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const nameDiff = productNameQuality(b) - productNameQuality(a);
    if (nameDiff !== 0) return nameDiff;
    const prodDiff = (b.products?.length ?? 0) - (a.products?.length ?? 0);
    if (prodDiff !== 0) return prodDiff;
    const blockDiff = (b.productBlocks?.length ?? 0) - (a.productBlocks?.length ?? 0);
    if (blockDiff !== 0) return blockDiff;
    return (b.quality ?? 0) - (a.quality ?? 0);
  });

  const best = candidates[0];
  const html = htmlEis && htmlEis !== best ? htmlEis : null;
  if (html?.productBlocks?.length && (!best.productBlocks?.length || best.products?.length === 0)) {
    return { ...best, productBlocks: html.productBlocks, products: html.products?.length ? html.products : best.products };
  }
  return best;
}

async function buildEnrichmentFromParsedFiles(
  regNumber: string,
  files: Array<{ name: string; buffer: Buffer; cachedPath: string }>,
  options: EnrichTzOptions
): Promise<TzEnrichmentResult | null> {
  const documents: ParsedTzDocument[] = [];
  let nmckItems: NmckLineItem[] = [];
  let bestOoz: DocumentParseResult | null = null;
  let bestOozDoc: ParsedTzDocument | null = null;
  let bestAny: DocumentParseResult | null = null;
  let bestAnyDoc: ParsedTzDocument | null = null;
  let nmckDoc: ParsedTzDocument | null = null;

  for (const file of files) {
    if (isContractDocument(file.name)) continue;

    const format =
      file.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() ||
      (await extractTextFromOfficeBuffer(file.buffer)).format;

    const docMeta: ParsedTzDocument = {
      name: file.name,
      url: "",
      format,
      sizeBytes: file.buffer.length,
      parsed: false,
      specCount: 0,
      cachedPath: file.cachedPath,
    };

    if (isNmckExcelName(file.name)) {
      const items = parseNmckExcelProducts(resolveOfficeBuffer(file.buffer));
      if (items.length > 0) {
        nmckItems = items;
        docMeta.parsed = true;
        docMeta.specCount = items.length;
        nmckDoc = docMeta;
      }
      documents.push(docMeta);
      continue;
    }

    if (isNmckJustificationDocxName(file.name)) {
      const items = parseNmckDocxProducts(resolveOfficeBuffer(file.buffer));
      if (items.length > 0) {
        nmckItems = items;
        docMeta.parsed = true;
        docMeta.specCount = items.length;
        nmckDoc = docMeta;
      }
      documents.push(docMeta);
      continue;
    }

    const parsed = parseDocumentAttachment(file.buffer, file.name);
    if (!parsed || parsed.productSpecs.length === 0) {
      documents.push(docMeta);
      continue;
    }

    docMeta.parsed = parsed.quality >= 25;
    docMeta.specCount = parsed.productSpecs.length;
    documents.push(docMeta);

    if (!bestAny || parsed.quality > bestAny.quality) {
      bestAny = parsed;
      bestAnyDoc = docMeta;
    }

    if (isOozDocumentName(file.name)) {
      if (!bestOoz || parsed.quality > bestOoz.quality) {
        bestOoz = parsed;
        bestOozDoc = docMeta;
      }
    }
  }

  const effectiveOoz = enrichParseWithEisCatalog(
    resolveEffectiveTzParse(bestOoz, bestAny, options.htmlEisCatalog ?? null),
    options.htmlEisCatalog ?? null
  );
  const bestParse = mergeNmckAndOoz(nmckItems, effectiveOoz);
  const bestDoc =
    nmckItems.length > 0
      ? nmckDoc
      : effectiveOoz === bestOoz
        ? bestOozDoc ?? bestAnyDoc
        : bestAnyDoc ?? bestOozDoc;

  if (!bestParse || bestParse.productSpecs.length === 0) {
    return {
      productSpecs: options.htmlProductSpecs || [],
      products: [],
      technicalAssignment: options.htmlTechnicalAssignment || "",
      ktruCodes: options.htmlKtruCodes || [],
      documents,
      tzParsedFromFile: false,
    };
  }

  const mergedSpecs = mergeSpecs(options.htmlProductSpecs || [], bestParse.productSpecs);
  const ktruCodes = [...new Set([...(options.htmlKtruCodes || []), ...bestParse.ktruCodes])];
  const technicalAssignment = [
    bestDoc ? `Источник: «${bestDoc.name}» (${bestDoc.specCount} поз.)` : "",
    nmckItems.length > 0 ? `Опись НМЦК: ${nmckItems.length} строк` : "",
    effectiveOoz ? `Характеристики из ООЗ (${effectiveOoz.source})` : "",
    bestParse.technicalAssignment,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    productSpecs: mergedSpecs,
    products: bestParse.products,
    technicalAssignment,
    ktruCodes,
    documents,
    tzParsedFromFile: true,
    tzVolumes: bestParse.tzVolumes,
  };
}

/** Повторный разбор уже скачанных файлов из data/tz-cache/{regNumber}/ */
export async function enrichNoticeFromTzCache(
  regNumber: string,
  options: EnrichTzOptions = {}
): Promise<TzEnrichmentResult | null> {
  const dir = path.join(CACHE_DIR, regNumber);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const files: Array<{ name: string; buffer: Buffer; cachedPath: string }> = [];
  for (const entry of entries) {
    const cachedPath = path.join(dir, entry);
    const buffer = await readFile(cachedPath);
    if (buffer.length === 0) continue;
    const displayName = entry
      .replace(new RegExp(`^${regNumber}_`), "")
      .replace(/_/g, " ")
      .replace(/\.(\w+)$/i, (_, ext) => `.${ext}`);
    files.push({ name: displayName, buffer, cachedPath });
  }

  if (files.length === 0) return null;
  return buildEnrichmentFromParsedFiles(regNumber, files, options);
}

/**
 * Загружает documents.html, скачивает лучший файл ТЗ, извлекает характеристики.
 */
export async function enrichNoticeFromTzDocuments(
  regNumber: string,
  noticeType: string,
  options: EnrichTzOptions = {}
): Promise<TzEnrichmentResult | null> {
  const maxParse = options.maxDocuments ?? (options.batchLight ? 3 : 4);
  const maxAll = options.batchLight ? maxParse : (options.maxAllDocuments ?? 12);

  const docsUrl = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/documents.html?regNumber=${regNumber}`;
  const html = await readResponseText(await fetchWithTimeout(docsUrl));
  const attachments = dedupeAttachments(parseDocumentsPageHtml(html));

  if (attachments.length === 0) return null;

  const parseCandidates = pickParseCandidates(attachments, maxParse);
  const allToDownload = options.batchLight
    ? parseCandidates
    : pickAllDownloadableAttachments(attachments, maxAll);

  if (options.skipDownload) {
    return {
      productSpecs: options.htmlProductSpecs || [],
      products: [],
      technicalAssignment: options.htmlTechnicalAssignment || "",
      ktruCodes: options.htmlKtruCodes || [],
      documents: allToDownload.map((c) => ({
        name: c.name,
        url: c.url,
        format: c.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "unknown",
        sizeBytes: 0,
        parsed: false,
        specCount: 0,
      })),
      tzParsedFromFile: false,
    };
  }

  const docByUrl = new Map<string, ParsedTzDocument>();
  let nmckItems: NmckLineItem[] = [];
  let bestOoz: DocumentParseResult | null = null;
  let bestOozDoc: ParsedTzDocument | null = null;
  let bestAny: DocumentParseResult | null = null;
  let bestAnyDoc: ParsedTzDocument | null = null;
  let nmckDoc: ParsedTzDocument | null = null;

  // Фаза 1: скачиваем все вложения в кэш (для кнопок «Скачать» / архив).
  for (const attachment of allToDownload) {
    try {
      const downloaded = await downloadToCache(regNumber, attachment);
      if (!downloaded) continue;

      const format =
        attachment.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() ||
        (await extractTextFromOfficeBuffer(downloaded.buffer)).format;

      docByUrl.set(attachment.url, {
        name: attachment.name,
        url: attachment.url,
        format,
        sizeBytes: downloaded.sizeBytes,
        parsed: false,
        specCount: 0,
        cachedPath: downloaded.cachedPath,
      });
    } catch (e) {
      docByUrl.set(attachment.url, {
        name: attachment.name,
        url: attachment.url,
        format: attachment.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "unknown",
        sizeBytes: 0,
        parsed: false,
        specCount: 0,
      });
      console.error(`TZ download ${regNumber} ${attachment.name}:`, e);
    }
  }

  // Фаза 2: разбираем только приоритетные файлы ТЗ/НМЦК.
  for (const attachment of parseCandidates) {
    const docMeta = docByUrl.get(attachment.url);
    if (!docMeta?.cachedPath) continue;

    try {
      const buffer = await readFile(docMeta.cachedPath);

      if (isNmckExcelName(attachment.name)) {
        const items = parseNmckExcelProducts(resolveOfficeBuffer(buffer));
        if (items.length > 0) {
          nmckItems = items;
          docMeta.parsed = true;
          docMeta.specCount = items.length;
          nmckDoc = docMeta;
        }
        continue;
      }

      if (isNmckJustificationDocxName(attachment.name)) {
        const items = parseNmckDocxProducts(resolveOfficeBuffer(buffer));
        if (items.length > 0) {
          nmckItems = items;
          docMeta.parsed = true;
          docMeta.specCount = items.length;
          nmckDoc = docMeta;
        }
        continue;
      }

      const parsed = parseDocumentAttachment(buffer, attachment.name);
      if (!parsed || parsed.productSpecs.length === 0) continue;

      docMeta.parsed = parsed.quality >= 25;
      docMeta.specCount = parsed.productSpecs.length;

      if (!bestAny || parsed.quality > bestAny.quality) {
        bestAny = parsed;
        bestAnyDoc = docMeta;
      }

      if (isOozDocumentName(attachment.name)) {
        if (!bestOoz || parsed.quality > bestOoz.quality) {
          bestOoz = parsed;
          bestOozDoc = docMeta;
        }
      }
    } catch (e) {
      console.error(`TZ parse ${regNumber} ${attachment.name}:`, e);
    }
  }

  const documents = [...docByUrl.values()].sort((a, b) => {
    const ga = classifyProcurementDocument(a.name);
    const gb = classifyProcurementDocument(b.name);
    const order = { tz: 0, nmck: 1, notice: 2, contract: 3, other: 4 };
    return (order[ga] ?? 9) - (order[gb] ?? 9);
  });

  const effectiveOoz = enrichParseWithEisCatalog(
    resolveEffectiveTzParse(bestOoz, bestAny, options.htmlEisCatalog ?? null),
    options.htmlEisCatalog ?? null
  );
  const bestParse = mergeNmckAndOoz(nmckItems, effectiveOoz);
  const bestDoc =
    nmckItems.length > 0
      ? nmckDoc
      : effectiveOoz === bestOoz
        ? bestOozDoc ?? bestAnyDoc
        : bestAnyDoc ?? bestOozDoc;

  if (!bestParse || bestParse.productSpecs.length === 0) {
    const cached = await enrichNoticeFromTzCache(regNumber, options);
    if (cached?.tzParsedFromFile) {
      // Объединяем полный список файлов с результатом из кэша.
      const merged = new Map<string, ParsedTzDocument>();
      for (const d of documents) merged.set(d.url || d.name, d);
      for (const d of cached.documents) {
        const key = d.url || d.name;
        if (!merged.has(key)) merged.set(key, d);
      }
      return { ...cached, documents: [...merged.values()] };
    }

    return {
      productSpecs: options.htmlProductSpecs || [],
      products: [],
      technicalAssignment: options.htmlTechnicalAssignment || "",
      ktruCodes: options.htmlKtruCodes || [],
      documents,
      tzParsedFromFile: false,
    };
  }

  const mergedSpecs = mergeSpecs(options.htmlProductSpecs || [], bestParse.productSpecs);
  const ktruCodes = [...new Set([...(options.htmlKtruCodes || []), ...bestParse.ktruCodes])];

  const technicalAssignment = [
    bestDoc ? `Источник: «${bestDoc.name}» (${bestDoc.specCount} поз.)` : "",
    nmckItems.length > 0 ? `Опись НМЦК: ${nmckItems.length} строк` : "",
    bestOoz ? `Характеристики из ООЗ (${bestOoz.source})` : effectiveOoz ? `Характеристики из файла (${effectiveOoz.source})` : "",
    bestParse.technicalAssignment,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    productSpecs: mergedSpecs,
    products: bestParse.products,
    technicalAssignment,
    ktruCodes,
    documents,
    tzParsedFromFile: true,
    tzVolumes: bestParse.tzVolumes,
  };
}

export async function fetchDocumentsPageHtml(regNumber: string, noticeType: string): Promise<string> {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/documents.html?regNumber=${regNumber}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readResponseText(res);
}

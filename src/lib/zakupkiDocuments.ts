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
import { zakupkiFetch } from "@/lib/zakupkiQueue";
import { isPlaceholderPositionName, isUsefulTzCharacteristic, looksLikeProductName } from "@/lib/tzSanitizer";
import type { TzVolume } from "@/lib/tzVolumes";

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
  tzVolumes?: TzVolume[];
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

function resolveAttachmentName(title: string | undefined, linkText: string): string {
  const titleClean = (title || "").replace(/_/g, " ").trim();
  const textClean = linkText.replace(/\s+/g, " ").trim();
  const ext = titleClean.match(/\.(\w+)$/i)?.[1];

  if (textClean.length >= 3 && !/^document\.bin$/i.test(textClean)) {
    if (ext && !new RegExp(`\\.${ext}$`, "i").test(textClean)) {
      return `${textClean}.${ext}`;
    }
    if (!/\.\w{2,5}$/i.test(textClean) && ext) {
      return `${textClean}.${ext}`;
    }
    return textClean;
  }

  if (titleClean.length >= 4) return titleClean;
  return "document.bin";
}

/** Парсит documents.html — список вложений filestore */
export function parseDocumentsPageHtml(html: string): ZakupkiAttachment[] {
  const docs: ZakupkiAttachment[] = [];
  const seen = new Set<string>();

  // Основной формат ЕИС: <a href="...filestore..." title="file.pdf">Человекочитаемое имя</a>
  const anchorRe =
    /<a\s+[^>]*href="([^"]*(?:filestore|download|downloadFile)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const url = normalizeFilestoreUrl(m[1]);
    if (seen.has(url)) continue;

    const title = m[0].match(/\btitle="([^"]+)"/i)?.[1];
    const linkText = stripHtml(m[2]);
    const name = resolveAttachmentName(title, linkText);
    if (/^document\.bin$/i.test(name)) continue;

    seen.add(url);
    let score = scoreAttachmentName(name);
    if (score <= 0 && /\.(pdf|docx?|xlsx?|rtf|zip|rar|7z)$/i.test(name)) score = 8;
    if (score <= 0) score = 8;

    docs.push({ name, url, score });
  }

  // Fallback для нестандартной вёрстки
  const re =
    /([\s\S]{0,600})href="([^"]*(?:filestore|download|downloadFile)[^"]+)"([\s\S]{0,260})/gi;
  while ((m = re.exec(html)) !== null) {
    const url = normalizeFilestoreUrl(m[2]);
    if (seen.has(url)) continue;
    seen.add(url);

    const ctx = m[1] + " " + m[3];
    const titleInCtx = ctx.match(/\btitle="([^"]+)"/i)?.[1];
    const name = titleInCtx
      ? resolveAttachmentName(titleInCtx, extractFileNameFromContext(ctx))
      : extractFileNameFromContext(ctx);
    if (/^document\.bin$/i.test(name)) continue;

    let score = scoreAttachmentName(name);
    if (score <= 0 && /\.(pdf|docx?|xlsx?|rtf|zip|rar|7z)$/i.test(name)) score = 8;
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
  return zakupkiFetch(url, {
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
    .replace(/\.(docx?|pdf|rtf|xlsx?|zip|rar|7z)$/i, "")
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

function isTzMetaLine(spec: string): boolean {
  const key = spec.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /^позиция\s*тз/i.test(key) ||
    /^объём закупки:/i.test(key) ||
    /^ктру:/i.test(key) ||
    /регистрационн[ое]+\s+удостоверен/i.test(key)
  );
}

function countUsefulTzSpecs(specs: string[]): number {
  return specs.filter((s) => {
    if (isTzMetaLine(s)) return false;
    if (s.includes(" — ")) return isUsefulTzCharacteristic(s);
    const m = s.match(/^([^:]{3,120}):\s*(.+)$/);
    if (m) return isUsefulTzCharacteristic(s, m[1], m[2]);
    return false;
  }).length;
}

/** Ключ для дедупа: «Материал бахил: …» совпадает с «Набор … — Материал бахил: …» */
function specMergeKey(spec: string): string {
  const norm = spec.replace(/\s+/g, " ").trim();
  if (norm.includes(" — ")) {
    const tail = norm.split(/\s+[—–-]\s+/).pop() || norm;
    return tail.toLowerCase();
  }
  return norm.toLowerCase();
}

function mergeSpecs(htmlSpecs: string[], tzSpecs: string[]): string[] {
  const tzUseful = countUsefulTzSpecs(tzSpecs);
  const htmlUseful = countUsefulTzSpecs(htmlSpecs);

  // Файл ТЗ часто даёт 1–2 строки, а каталог КТРУ на ЕИС — полный список признаков
  const htmlToMerge =
    htmlUseful > tzUseful
      ? htmlSpecs
      : htmlSpecs.filter(
          (s) => /^КТРУ:/i.test(s) || /регистрационн[ое]+\s+удостоверен/i.test(s)
        );

  const seen = new Set<string>();
  const result: string[] = [];
  let hasGoodPositionName = false;

  for (const spec of [...tzSpecs, ...htmlToMerge]) {
    const trimmed = spec.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    const isPosition = /^позиция\s*тз:/i.test(lower);
    const isVolume = /^объём закупки:/i.test(lower);

    // Разные источники (файл ТЗ / каталог КТРУ ЕИС) могут дать по одной и той же позиции
    // и нормальное название, и «Позиция N (поз. N)» — вторая строка не несёт пользы и только
    // плодит лишние карточки в «Наборы и позиции ТЗ». Раз хорошее имя уже есть — плейсхолдер
    // из другого источника для той же позиции просто не добавляем (а не только дедуп по тексту).
    if (isPosition) {
      const posName = trimmed.replace(/^Позиция\s*ТЗ:\s*/i, "").trim();
      const isPlaceholder = isPlaceholderPositionName(posName);
      if (isPlaceholder && hasGoodPositionName) continue;
      if (!isPlaceholder) hasGoodPositionName = true;
    }

    if (isPosition || isVolume) {
      const metaKey = isVolume ? `vol:${lower.replace(/\d+/g, "#")}` : lower;
      if (seen.has(metaKey)) continue;
      seen.add(metaKey);
      result.push(trimmed);
      continue;
    }

    const key = specMergeKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
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

function tryNmckItemsFromSpreadsheet(buffer: Buffer, fileName: string): NmckLineItem[] {
  if (!/\.xlsx?$/i.test(fileName) || isOozDocumentName(fileName)) return [];
  return parseNmckExcelProducts(resolveOfficeBuffer(buffer));
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
    // productBlocks из html.eis всегда нужны (у best их может не быть вовсе), а вот products
    // берём из html только если там реальные названия — иначе легко заменить нормальное
    // "Ножницы хирургические..." на плейсхолдеры "Позиция N" из каталога КТРУ ЕИС.
    const products = productNameQuality(html) > 0 ? html.products : best.products?.length ? best.products : html.products;
    return { ...best, productBlocks: html.productBlocks, products };
  }
  return best;
}

/**
 * Объём закупки часто лежит в другом файле, чем характеристики (напр. отдельное
 * «Описание объекта закупки» с таблицей № | Наименование | Ед. | Кол-во, а сами
 * характеристики — в файле по ст. 33 44-ФЗ). Если у победившего разбора нет
 * объёма, но он нашёлся в другом разобранном файле — переносим его.
 */
function recoverMissingVolumes(
  effectiveOoz: DocumentParseResult | null,
  volumeCandidate: DocumentParseResult | null
): DocumentParseResult | null {
  if (!effectiveOoz || effectiveOoz.tzVolumes?.length || !volumeCandidate?.tzVolumes?.length) {
    return effectiveOoz;
  }
  return { ...effectiveOoz, tzVolumes: volumeCandidate.tzVolumes };
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
  let volumeCandidate: DocumentParseResult | null = null;

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

    const nmckFromXlsx = tryNmckItemsFromSpreadsheet(file.buffer, file.name);
    if (nmckFromXlsx.length > 0) {
      if (nmckFromXlsx.length > nmckItems.length) {
        nmckItems = nmckFromXlsx;
        docMeta.parsed = true;
        docMeta.specCount = nmckFromXlsx.length;
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

    const parsed = await parseDocumentAttachment(file.buffer, file.name);
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

    if ((parsed.tzVolumes?.length ?? 0) > (volumeCandidate?.tzVolumes?.length ?? 0)) volumeCandidate = parsed;
  }

  const effectiveOoz = recoverMissingVolumes(
    enrichParseWithEisCatalog(
      resolveEffectiveTzParse(bestOoz, bestAny, options.htmlEisCatalog ?? null),
      options.htmlEisCatalog ?? null
    ),
    volumeCandidate
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
  const maxAll = options.batchLight ? maxParse : (options.maxAllDocuments ?? 24);

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
  let volumeCandidate: DocumentParseResult | null = null;

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

      const nmckFromXlsx = tryNmckItemsFromSpreadsheet(buffer, attachment.name);
      if (nmckFromXlsx.length > 0) {
        if (nmckFromXlsx.length > nmckItems.length) {
          nmckItems = nmckFromXlsx;
          docMeta.parsed = true;
          docMeta.specCount = nmckFromXlsx.length;
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

      const parsed = await parseDocumentAttachment(buffer, attachment.name);
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

      if ((parsed.tzVolumes?.length ?? 0) > (volumeCandidate?.tzVolumes?.length ?? 0)) volumeCandidate = parsed;
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

  const effectiveOoz = recoverMissingVolumes(
    enrichParseWithEisCatalog(
      resolveEffectiveTzParse(bestOoz, bestAny, options.htmlEisCatalog ?? null),
      options.htmlEisCatalog ?? null
    ),
    volumeCandidate
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

const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; attachmentRe: RegExp }> = [
  { re: /извещени/i, attachmentRe: /извещени/i },
  { re: /описание объекта закупки/i, attachmentRe: /описание объекта закупки/i },
  { re: /техническ.*задани|\bтз\b/i, attachmentRe: /техническ.*задани|\bтз\b|описание объекта/i },
  { re: /проект\s+контракта/i, attachmentRe: /проект\s+контракта/i },
];

function pickAttachmentByDisplayName(
  docName: string,
  attachments: ZakupkiAttachment[]
): ZakupkiAttachment | null {
  if (attachments.length === 0) return null;

  const exact = attachments.find((a) => a.name === docName);
  if (exact) return exact;

  const norm = normalizeAttachmentName(docName);
  const byNorm = attachments.find((a) => normalizeAttachmentName(a.name) === norm);
  if (byNorm) return byNorm;

  const partial = attachments.find((a) => {
    const n = normalizeAttachmentName(a.name);
    return n.includes(norm) || norm.includes(n);
  });
  if (partial) return partial;

  for (const { re, attachmentRe } of PLACEHOLDER_PATTERNS) {
    if (re.test(docName)) {
      const hit = attachments.find((a) => attachmentRe.test(a.name));
      if (hit) return hit;
    }
  }

  // Извещение на ЕИС часто = ElectronicAuction{номер}.pdf
  if (/извещени/i.test(docName)) {
    const eaPdf = attachments.find(
      (a) => /^electronicauction/i.test(a.name) && /\.pdf$/i.test(a.name)
    );
    if (eaPdf) return eaPdf;
    const anyNoticePdf = attachments.find(
      (a) => /\.pdf$/i.test(a.name) && !/нмцк|обоснован/i.test(a.name)
    );
    if (anyNoticePdf) return anyNoticePdf;
  }

  // ООЗ / ТЗ — отдельный PDF или docx
  if (/описание|техническ.*задани|\bтз\b|объект\s+закупки/i.test(docName)) {
    const ooz = attachments.find((a) =>
      /описание объекта|техническ.*задани|спецификац|характеристик/i.test(a.name)
    );
    if (ooz) return ooz;

    const tzPdf = attachments.find((a) =>
      /техническ.*задани/i.test(a.name) && /\.pdf$/i.test(a.name)
    );
    if (tzPdf) return tzPdf;

    const nonNmck = attachments.filter(
      (a) =>
        !/нмцк|расчет\s*нмцк|обоснован\s+начальн/i.test(a.name) &&
        !isContractDocument(a.name)
    );
    const pdfs = nonNmck.filter((a) => /\.pdf$/i.test(a.name));
    if (pdfs.length === 1) return pdfs[0];
    if (nonNmck.length === 1) return nonNmck[0];
    if (pdfs.length > 0 && attachments.length <= 3) return pdfs[0];
  }

  if (/проект\s+контракта/i.test(docName)) {
    return attachments.find((a) => /проект\s+контракта/i.test(a.name)) ?? null;
  }

  return null;
}

const EIS_DOCS_CACHE = new Map<string, { at: number; docs: ParsedTzDocument[] }>();
const EIS_DOCS_TTL_MS = 6 * 60 * 60 * 1000;
/** Сбрасывать кэш при смене parseDocumentsPageHtml */
const EIS_DOCS_PARSER_REV = 2;

/** Реальные вложения с documents.html (без разбора ТЗ) */
export async function listTenderEisAttachments(
  regNumber: string,
  noticeType: string
): Promise<ParsedTzDocument[]> {
  const html = await fetchDocumentsPageHtml(regNumber, noticeType);
  const attachments = dedupeAttachments(parseDocumentsPageHtml(html));
  return attachments.map((a) => ({
    name: a.name,
    url: a.url,
    format: a.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "unknown",
    sizeBytes: 0,
    parsed: false,
    specCount: 0,
  }));
}

const NOTICE_TYPE_FALLBACKS = ["ea20", "ea44", "zk20", "ok504", "zp504", "ezt20"];

export async function listTenderEisAttachmentsCached(
  regNumber: string,
  noticeType: string
): Promise<ParsedTzDocument[]> {
  const types = [noticeType, ...NOTICE_TYPE_FALLBACKS.filter((t) => t !== noticeType)];
  for (const nt of types) {
    const key = `${EIS_DOCS_PARSER_REV}:${nt}:${regNumber}`;
    const hit = EIS_DOCS_CACHE.get(key);
    if (hit && Date.now() - hit.at < EIS_DOCS_TTL_MS && hit.docs.length > 0) {
      return hit.docs;
    }
    try {
      const docs = await listTenderEisAttachments(regNumber, nt);
      if (docs.length > 0) {
        EIS_DOCS_CACHE.set(key, { at: Date.now(), docs });
        return docs;
      }
    } catch {
      // try next notice type
    }
  }
  return [];
}

/** Скачать вложение с ЕИС по отображаемому имени (PDF, ZIP и т.д.) */
export async function fetchTenderAttachment(
  regNumber: string,
  noticeType: string,
  docName: string
): Promise<{
  buffer: Buffer;
  cachedPath: string;
  fileName: string;
  format: string;
} | null> {
  const types = [noticeType, ...NOTICE_TYPE_FALLBACKS.filter((t) => t !== noticeType)];

  for (const nt of types) {
    let attachments: ZakupkiAttachment[] = [];
    try {
      const html = await fetchDocumentsPageHtml(regNumber, nt);
      attachments = dedupeAttachments(parseDocumentsPageHtml(html));
    } catch {
      continue;
    }
    if (attachments.length === 0) continue;

    const attachment = pickAttachmentByDisplayName(docName, attachments);
    if (!attachment) continue;

    try {
      const downloaded = await downloadToCache(regNumber, attachment);
      if (!downloaded) continue;

      const format =
        attachment.name.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "bin";

      return {
        buffer: downloaded.buffer,
        cachedPath: downloaded.cachedPath,
        fileName: attachment.name,
        format,
      };
    } catch (e) {
      console.error(`[zakupki] download ${regNumber} ${attachment.name}:`, e);
    }
  }

  return null;
}

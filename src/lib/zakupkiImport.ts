/**
 * Импорт реальных закупок 44-ФЗ с zakupki.gov.ru (публичный HTML, без токена).
 */

import { buildZakupkiUrl } from "@/lib/zakupki";
import { isMedicalTender, MEDICAL_TENDER_DOCUMENTS, MEDICAL_KEYWORDS } from "@/lib/productVertical";
import type { CompanyFocus } from "@/lib/companyFocus";
import { scoreTenderRelevance } from "@/lib/companyFocus";
import { enrichNoticeFromTzDocuments, enrichNoticeFromTzCache, type EnrichTzOptions, type ParsedTzDocument } from "@/lib/zakupkiDocuments";
import { decodeHtmlEntities, normalizeTzSpecText, repairFragmentedRussian, stripEisMarkup } from "@/lib/textNormalize";
import { isGarbageCharacteristic } from "@/lib/tzSanitizer";
import { inferProductsFromTzData } from "@/lib/tzNomenclature";
import { parseNationalRegimeFromNoticeHtml, type StoredNationalRegime } from "@/lib/nationalRegime";
import { parseEisKtruCatalogHtml, eisCatalogToDocumentParse } from "@/lib/eisKtruCatalogParser";
import { applyResolvedTzNames } from "@/lib/tzProductLabelResolve";
import { zakupkiFetch } from "@/lib/zakupkiQueue";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 25_000;

export interface ZakupkiSearchEntry {
  regNumber: string;
  noticeType: string;
  procedureType: string;
  status: string;
  title: string;
  customerName: string;
  price: number;
  publishedAt: Date;
  deadline: Date;
  sourceUrl: string;
}

export interface ZakupkiNoticeDetails {
  procedureType: string;
  platform: string;
  platformUrl: string;
  customerName: string;
  title: string;
  region: string;
  stage: string;
  publishedAt: Date | null;
  deadline: Date | null;
  productSpecs: string[];
  technicalAssignment: string;
  ktruCodes: string[];
  isMedical: boolean;
  tzDocuments?: ParsedTzDocument[];
  tzParsedFromFile?: boolean;
  tzProducts?: string[];
  tzVolumes?: Array<{
    name: string;
    ktruCode?: string;
    quantity: number;
    unit: string;
    position?: string;
  }>;
  nationalRegime?: StoredNationalRegime | null;
}

export interface ImportedTender {
  externalId: string;
  title: string;
  description: string;
  customerName: string;
  region: string;
  price: number;
  publishedAt: Date;
  deadline: Date;
  category: string;
  okvedCode: string;
  sourceUrl: string;
  requirements: Record<string, unknown>;
}

export interface EisSearchQuery {
  query: string;
  category: string;
  okved: string;
}

export const MEDICAL_SEARCH_QUERIES: EisSearchQuery[] = [
  { query: "медицинские изделия", category: "Медизделия", okved: "46.46" },
  { query: "комплект белья стерильный", category: "Медрасходники", okved: "46.46" },
  { query: "медицинские расходные материалы", category: "Медрасходники", okved: "46.46" },
  { query: "нетканое полотно медицинское", category: "Нетканка", okved: "32.50" },
  { query: "белье медицинское одноразовое", category: "Медбельё", okved: "46.46" },
  { query: "салфетки медицинские нетканые", category: "Расходники", okved: "46.46" },
  { query: "перевязочные материалы медицинские", category: "Медрасходники", okved: "32.50" },
  { query: "халаты хирургические одноразовые", category: "Медтекстиль", okved: "46.46" },
  { query: "регистрационное удостоверение медицинские", category: "Медизделия", okved: "46.46" },
  { query: "шприц медицинский", category: "Медрасходники", okved: "46.46" },
  { query: "простыни одноразовые стерильные", category: "Медбельё", okved: "46.46" },
  { query: "набор для операционной стерильный", category: "Медбельё", okved: "46.46" },
  { query: "полотно нетканое хирургическое", category: "Нетканка", okved: "32.50" },
  { query: "одежда медицинская одноразовая", category: "Медтекстиль", okved: "46.46" },
  { query: "покрывало хирургическое", category: "Медтекстиль", okved: "46.46" },
  { query: "салфетки марлевые стерильные", category: "Расходники", okved: "32.50" },
  { query: "бинт марлевый медицинский", category: "Расходники", okved: "32.50" },
  { query: "маска медицинская", category: "Медтекстиль", okved: "46.46" },
  { query: "шапочки хирургические", category: "Медтекстиль", okved: "46.46" },
];

function mergeSearchQueries(
  priority: EisSearchQuery[] = [],
  fallback: EisSearchQuery[] = MEDICAL_SEARCH_QUERIES
): EisSearchQuery[] {
  const seen = new Set<string>();
  const out: EisSearchQuery[] = [];
  for (const q of [...priority, ...fallback]) {
    const key = q.query.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function stripHtml(html: string): string {
  return stripEisMarkup(html);
}

function extractSectionInfo(html: string, sectionTitle: string): string {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rich = new RegExp(
    `section__title">\\s*${escaped}\\s*<\\/span>\\s*<span class="section__info">([\\s\\S]*?)<\\/span>`,
    "i"
  );
  const richMatch = html.match(rich);
  if (richMatch) return stripEisMarkup(richMatch[1]);

  const re = new RegExp(
    `section__title">\\s*${escaped}\\s*<\\/span>[\\s\\S]*?section__info">([\\s\\S]*?)<\\/`,
    "i"
  );
  const m = html.match(re);
  return m ? stripEisMarkup(m[1]) : "";
}

function parseRussianDate(value: string): Date | null {
  const m = value.trim().match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "12", min = "0"] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRussianPrice(raw: string): number {
  const cleaned = decodeHtmlEntities(raw)
    .replace(/[^\d,.]/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function extractBlockValue(block: string, title: string): string {
  const re = new RegExp(
    `registry-entry__body-title">${title}<\\/div>\\s*<div class="registry-entry__body-value">([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const m = block.match(re);
  return m ? stripHtml(m[1]) : "";
}

function extractBlockHref(block: string, title: string): string {
  const re = new RegExp(
    `registry-entry__body-title">${title}<\\/div>[\\s\\S]*?<a[^>]*>([\\s\\S]*?)<\\/a>`,
    "i"
  );
  const m = block.match(re);
  return m ? stripHtml(m[1]) : "";
}

export function parseSearchResultsHtml(html: string): ZakupkiSearchEntry[] {
  const blocks = html.split("search-registry-entry-block").slice(1);
  const results: ZakupkiSearchEntry[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const linkMatch = block.match(
      /href="https:\/\/zakupki\.gov\.ru\/epz\/order\/notice\/([a-z0-9]+)\/view\/common-info\.html\?regNumber=(\d{19})"/i
    );
    if (!linkMatch) continue;

    const noticeType = linkMatch[1];
    const regNumber = linkMatch[2];
    if (seen.has(regNumber)) continue;
    seen.add(regNumber);

    const procedureType = stripHtml(
      block.match(/registry-entry__header-top__title[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "44-ФЗ"
    );
    const status = stripHtml(
      block.match(/registry-entry__header-mid__title[^>]*>([\s\S]*?)<\/div>/i)?.[1] || ""
    );
    const title = extractBlockValue(block, "Объект закупки");
    const customerName = extractBlockHref(block, "Заказчик") || extractBlockValue(block, "Заказчик");
    const priceRaw = block.match(/price-block__value[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "0";
    const price = parseRussianPrice(priceRaw);

    const publishedRaw = block.match(/data-block__title">Размещено<\/div>\s*<div class="data-block__value">([^<]+)/i)?.[1];
    const deadlineRaw = block.match(/data-block__title">Окончание подачи заявок<\/div>\s*<div class="data-block__value">([^<]+)/i)?.[1];

    const publishedAt = parseRussianDate(publishedRaw || "") || new Date();
    const deadline = parseRussianDate(deadlineRaw || "") || new Date(Date.now() + 14 * 86400000);

    results.push({
      regNumber,
      noticeType,
      procedureType,
      status,
      title: title || `Закупка №${regNumber}`,
      customerName: customerName || "Государственный заказчик",
      price,
      publishedAt,
      deadline,
      sourceUrl: buildZakupkiUrl(regNumber, procedureType),
    });
  }

  return results;
}

function isBudgetNoise(text: string): boolean {
  return (
    text.length > 120 ||
    /На \d{4} год|Всего, ₽|КБК|бюджет|Итого \(1 запись\)|Код видов расходов/i.test(text)
  );
}

function parseCharacteristicsTable(html: string): string[] {
  const specs: string[] = [];
  const rows = [...html.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi)];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripHtml(c[1]));
    if (cells.length < 2 || cells.length > 5) continue;
    if (cells[0] === "Наименование характеристики") continue;
    if (!cells[0] || cells[0] === "\u00a0") continue;
    if (isBudgetNoise(cells[0]) || isBudgetNoise(cells[1])) continue;
    if (/^\d{2}\.\d{2}\.\d{2}/.test(cells[0])) continue;

    const name = cells[0];
    const value = cells[1];
    if (!value || value.length > 180) continue;
    specs.push(`${name}: ${value}`);
  }

  return specs;
}

function extractProductLines(html: string): string[] {
  const lines: string[] = [];

  const productRows = [...html.matchAll(
    /<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi
  )];

  for (const row of productRows) {
    const text = stripHtml(row[1]);
    if (!/является медицинским изделием|медицинск/i.test(text)) continue;
    if (isBudgetNoise(text)) continue;
    if (text.length > 30 && text.length < 400) {
      lines.push(text);
    }
  }

  const ktru = [...html.matchAll(/\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/g)].map((m) => m[1]);
  for (const code of [...new Set(ktru)].slice(0, 5)) {
    lines.push(`КТРУ: ${code}`);
  }

  return lines;
}

export function parseNoticeCommonInfoHtml(html: string): ZakupkiNoticeDetails {
  const procedureType =
    extractSectionInfo(html, "Способ определения поставщика (подрядчика, исполнителя)") || "44-ФЗ";

  const platform = normalizePlatformName(
    extractSectionInfo(
      html,
      "Наименование электронной площадки в информационно-телекоммуникационной сети «Интернет»"
    )
  );

  const platformUrl = normalizePlatformUrl(
    platform,
    extractSectionInfo(
      html,
      "Адрес электронной площадки в информационно-телекоммуникационной сети «Интернет»"
    )
  );

  const objectName = repairFragmentedRussian(
    extractSectionInfo(html, "Наименование объекта закупки") || ""
  );

  const customerName = (() => {
    const org = extractSectionInfo(html, "Размещение осуществляет");
    if (org && org.length > 5 && !/^заказчик$/i.test(org)) return org.replace(/^Заказчик\s*/i, "").trim();
    const org2 = extractSectionInfo(html, "Организация, осуществляющая размещение");
    const cleaned = org2.replace(/^Заказчик\s*/i, "").trim();
    if (cleaned.length > 5 && !/^заказчик$/i.test(cleaned)) return cleaned;
    return "";
  })();

  const region = extractSectionInfo(html, "Регион");
  const stage = extractSectionInfo(html, "Этап закупки");

  const deadlineRaw = extractSectionInfo(html, "Дата и время окончания срока подачи заявок");
  const publishedRaw = extractSectionInfo(html, "Дата и время начала срока подачи заявок");

  const charSpecs = parseCharacteristicsTable(html)
    .map(normalizeTzSpecText)
    .filter((s) => s.length > 2 && !isGarbageCharacteristic(s));
  const productLines = extractProductLines(html).map(normalizeTzSpecText);

  const productSpecs = [...new Set([...productLines, ...charSpecs])].slice(0, 60);
  const tzProducts = inferProductsFromTzData(
    { productSpecs, technicalAssignment: objectName },
    objectName
  );

  const medicalHints = [
    objectName,
    ...productSpecs,
    html.includes("медицинским изделием") ? "медицинское изделие" : "",
    html.includes("Росздравнадзор") ? "Росздравнадзор" : "",
    html.includes("регистрационн") ? "регистрационное удостоверение" : "",
  ].filter(Boolean);

  const isMedical = isMedicalTender(
    { category: "Медизделия", title: objectName, okvedCode: "46.46" },
    { productSpecs: medicalHints }
  );

  if (isMedical && !productSpecs.some((s) => /ру|росздрав|регистрацион/i.test(s))) {
    productSpecs.unshift("Регистрационное удостоверение Росздравнадзора на медицинское изделие (при наличии в ТЗ)");
  }

  const technicalAssignment = [
    objectName,
    charSpecs.length > 0 ? `Характеристики по извещению: ${charSpecs.slice(0, 6).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const ktruCodes = [...new Set([...html.matchAll(/\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/g)].map((m) => m[1]))];

  const nationalRegime = parseNationalRegimeFromNoticeHtml(html);

  return {
    procedureType,
    platform,
    platformUrl,
    customerName,
    title: objectName,
    region,
    stage,
    publishedAt: parseRussianDate(publishedRaw || ""),
    deadline: parseRussianDate(deadlineRaw || ""),
    productSpecs,
    technicalAssignment,
    ktruCodes,
    isMedical,
    tzProducts,
    nationalRegime,
  };
}

function normalizePlatformName(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("ртс")) return "РТС-Тендер";
  if (t.includes("сбер")) return "Сбербанк-АСТ";
  if (t.includes("росэл") || t.includes("roseltorg")) return "ЕЭТП (Росэлторг)";
  if (t.includes("тэк")) return "ТЭК-Торг";
  if (t.includes("заказрф")) return "ЗаказРФ";
  return raw || "Электронная площадка";
}

function normalizePlatformUrl(platform: string, url: string): string {
  if (url.startsWith("http")) return url.replace(/^http:/, "https:");
  const name = platform.toLowerCase();
  if (name.includes("ртс")) return "https://zakupki-satadmin.rts-tender.ru";
  if (name.includes("сбер")) return "https://www.sberbank-ast.ru";
  if (name.includes("росэл")) return "https://www.roseltorg.ru";
  if (name.includes("тэк")) return "https://www.tektorg.ru";
  if (name.includes("заказ")) return "https://www.zakazrf.ru";
  return url || "https://zakupki.gov.ru";
}

async function fetchHtml(url: string): Promise<string> {
  const response = await zakupkiFetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} для ${url}`);
  }

  const textPromise = response.text();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Таймаут загрузки HTML: ${url}`)), FETCH_TIMEOUT_MS);
  });
  return Promise.race([textPromise, timeoutPromise]);
}

export async function searchZakupki(
  searchQuery: string,
  page = 1,
  recordsPerPage = 10
): Promise<ZakupkiSearchEntry[]> {
  const params = new URLSearchParams({
    searchString: searchQuery,
    morphology: "on",
    order: "date_pub desc",
    pageNumber: String(page),
    recordsPerPage: String(recordsPerPage),
    fz44: "on",
    af: "on",
  });

  const html = await fetchHtml(
    `https://zakupki.gov.ru/epz/order/extendedsearch/results.html?${params}`
  );
  return parseSearchResultsHtml(html);
}

export async function fetchNoticeDetails(
  regNumber: string,
  noticeType: string,
  options: { parseTzFiles?: boolean; tzEnrich?: EnrichTzOptions } = {}
): Promise<ZakupkiNoticeDetails> {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${regNumber}`;
  const html = await fetchHtml(url);
  const details = parseNoticeCommonInfoHtml(html);
  const eisCatalogRaw = parseEisKtruCatalogHtml(html);
  const htmlEisCatalog = eisCatalogRaw ? eisCatalogToDocumentParse(eisCatalogRaw) : null;
  if (htmlEisCatalog && htmlEisCatalog.products.length > 0) {
    details.productSpecs = [...new Set([...htmlEisCatalog.productSpecs, ...details.productSpecs])].slice(
      0,
      300
    );
    details.tzProducts = htmlEisCatalog.products;
    details.ktruCodes = [...new Set([...details.ktruCodes, ...htmlEisCatalog.ktruCodes])];
    if (htmlEisCatalog.tzVolumes?.length) {
      details.tzVolumes = htmlEisCatalog.tzVolumes;
    }
  }

  const parseTz = options.parseTzFiles !== false;
  if (!parseTz) {
    applyResolvedTzNames(details);
    return details;
  }

  const tzEnrichOpts = {
    htmlProductSpecs: details.productSpecs,
    htmlTechnicalAssignment: details.technicalAssignment,
    htmlKtruCodes: details.ktruCodes,
    htmlEisCatalog,
    maxDocuments: 4,
    maxAllDocuments: 12,
    ...options.tzEnrich,
  };

  try {
    await sleep(250);

    if (tzEnrichOpts.batchLight) {
      const cached = await enrichNoticeFromTzCache(regNumber, tzEnrichOpts);
      if (cached?.tzParsedFromFile) {
        details.productSpecs = cached.productSpecs;
        details.technicalAssignment = cached.technicalAssignment || details.technicalAssignment;
        details.ktruCodes = cached.ktruCodes;
        details.tzDocuments = cached.documents;
        details.tzParsedFromFile = true;
        details.tzProducts = cached.products;
        details.tzVolumes = cached.tzVolumes;
        applyResolvedTzNames(details);
        return details;
      }
    }

    const tz = await enrichNoticeFromTzDocuments(regNumber, noticeType, tzEnrichOpts);

    if (tz) {
      details.productSpecs = tz.productSpecs;
      details.technicalAssignment = tz.technicalAssignment || details.technicalAssignment;
      details.ktruCodes = tz.ktruCodes;
      details.tzDocuments = tz.documents;
      details.tzParsedFromFile = tz.tzParsedFromFile;
      details.tzProducts = tz.products;
      details.tzVolumes = tz.tzVolumes;
    }
  } catch (e) {
    console.error(`TZ enrichment failed for ${regNumber}:`, e);
    try {
      const cached = await enrichNoticeFromTzCache(regNumber, {
        htmlProductSpecs: details.productSpecs,
        htmlTechnicalAssignment: details.technicalAssignment,
        htmlKtruCodes: details.ktruCodes,
        htmlEisCatalog,
      });
      if (cached?.tzParsedFromFile) {
        details.productSpecs = cached.productSpecs;
        details.technicalAssignment = cached.technicalAssignment || details.technicalAssignment;
        details.ktruCodes = cached.ktruCodes;
        details.tzDocuments = cached.documents;
        details.tzParsedFromFile = true;
        details.tzProducts = cached.products;
      }
    } catch (cacheErr) {
      console.error(`TZ cache fallback failed for ${regNumber}:`, cacheErr);
    }
  }

  applyResolvedTzNames(details);

  return details;
}

async function mapPool<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await mapper(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export function toImportedTenderFromSearch(
  entry: ZakupkiSearchEntry,
  meta: { category: string; okved: string }
): ImportedTender {
  const title = repairFragmentedRussian(stripEisMarkup(entry.title || `Закупка №${entry.regNumber}`));
  const customerName = stripEisMarkup(entry.customerName || "Государственный заказчик");
  const productSpecs: string[] = [];

  return {
    externalId: entry.regNumber,
    title,
    description: `${title}. Заказчик: ${customerName}. Импортировано с zakupki.gov.ru (краткая карточка).`,
    customerName,
    region: "Россия",
    price: entry.price,
    publishedAt: entry.publishedAt,
    deadline: entry.deadline,
    category: meta.category,
    okvedCode: meta.okved,
    sourceUrl: entry.sourceUrl,
    requirements: {
      platform: "",
      platformUrl: "",
      law: "44-ФЗ",
      procedureType: entry.procedureType,
      licenses: [],
      minRevenue: 0,
      experience: "",
      productSpecs,
      technicalAssignment: title,
      tenderDocuments: MEDICAL_TENDER_DOCUMENTS,
      requiredDocs: ["Регистрационное удостоверение (РУ) с приложением", "Реестр контрактов ЕИС"],
      securityDeposit: 5,
      contractSecurity: 10,
      isDemo: false,
      importedFromEis: true,
      importedAt: new Date().toISOString(),
      eisStage: entry.status,
      ktruCodes: [],
      noticeType: entry.noticeType,
      tzParsedFromFile: false,
      tzEnrichmentPending: true,
      tzProducts: [],
      tzDocuments: [],
      importMode: "search_only",
    },
  };
}

function looksMedicalFromSearch(
  entry: ZakupkiSearchEntry,
  meta: { category: string; okved: string }
): boolean {
  const text = `${entry.title} ${meta.category}`.toLowerCase();
  if (MEDICAL_KEYWORDS.some((kw) => text.includes(kw))) return true;
  return isMedicalTender(
    { category: meta.category, title: entry.title, okvedCode: meta.okved },
    { productSpecs: entry.title ? [entry.title] : [] }
  );
}

export function toImportedTender(
  entry: ZakupkiSearchEntry,
  details: ZakupkiNoticeDetails,
  meta: { category: string; okved: string }
): ImportedTender {
  const title = details.title || entry.title;
  const customerName = stripEisMarkup(details.customerName || entry.customerName);
  const region = details.region || "Россия";
  const publishedAt = details.publishedAt || entry.publishedAt;
  const deadline = details.deadline || entry.deadline;

  return {
    externalId: entry.regNumber,
    title,
    description: `${title}. Заказчик: ${customerName}. Регион: ${region}. Импортировано с zakupki.gov.ru.`,
    customerName,
    region,
    price: entry.price,
    publishedAt,
    deadline,
    category: meta.category,
    okvedCode: meta.okved,
    sourceUrl: entry.sourceUrl,
    requirements: {
      platform: details.platform,
      platformUrl: details.platformUrl,
      law: "44-ФЗ",
      procedureType: details.procedureType || entry.procedureType,
      licenses: [],
      minRevenue: 0,
      experience: "",
      productSpecs: details.productSpecs,
      technicalAssignment: details.technicalAssignment,
      tenderDocuments: MEDICAL_TENDER_DOCUMENTS,
      requiredDocs: details.isMedical
        ? ["Регистрационное удостоверение (РУ) с приложением", "Реестр контрактов ЕИС"]
        : ["Выписка ЕГРЮЛ", "Реестр контрактов ЕИС"],
      securityDeposit: 5,
      contractSecurity: 10,
      isDemo: false,
      importedFromEis: true,
      importedAt: new Date().toISOString(),
      eisStage: details.stage || entry.status,
      ktruCodes: details.ktruCodes,
      noticeType: entry.noticeType,
      tzParsedFromFile: details.tzParsedFromFile === true,
      tzEnrichmentPending: details.tzParsedFromFile !== true,
      tzProducts: details.tzProducts || [],
      tzVolumes: details.tzVolumes || [],
      importMode: details.tzParsedFromFile ? "tz_enriched" : "notice_enriched",
      tzDocuments: (details.tzDocuments || []).map((d) => ({
        name: d.name,
        url: d.url,
        format: d.format,
        parsed: d.parsed,
        specCount: d.specCount,
        sizeBytes: d.sizeBytes,
        cachedPath: d.cachedPath,
      })),
      nationalRegime: details.nationalRegime || null,
    },
  };
}

export interface ImportOptions {
  limit?: number;
  recordsPerQuery?: number;
  /** Сколько страниц ЕИС обходить по каждому запросу (1 ≈ 10–50 закупок) */
  searchPages?: number;
  concurrency?: number;
  medicalOnly?: boolean;
  parseTzFiles?: boolean;
  /** Быстрый импорт только из результатов поиска (без загрузки карточек ЕИС) */
  fastImport?: boolean;
  /**
   * Умный режим: карточки ЕИС для всех + файлы ТЗ для top-N по профилю компании.
   * Один проход вместо «сначала 2000, потом 80 с ТЗ».
   */
  smartMode?: boolean;
  tzTopN?: number;
  companyFocus?: CompanyFocus | null;
  /** Запросы по профилю компании — идут первыми в очереди поиска */
  searchQueries?: EisSearchQuery[];
  onProgress?: (msg: string) => void;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  scanned: number;
  tenders: ImportedTender[];
  tzEnriched?: number;
  noticeEnriched?: number;
}

function tenderForRelevanceScoring(t: ImportedTender) {
  return {
    title: t.title,
    category: t.category,
    requirements: t.requirements,
  };
}

async function enrichTopTendersWithTzFiles(
  items: Array<{ entry: ZakupkiSearchEntry & { meta: { category: string; okved: string } }; tender: ImportedTender }>,
  focus: CompanyFocus | null | undefined,
  topN: number,
  concurrency: number,
  onProgress?: (msg: string) => void
): Promise<{ tenders: ImportedTender[]; enriched: number; errors: string[] }> {
  if (topN <= 0 || items.length === 0) {
    return { tenders: items.map((i) => i.tender), enriched: 0, errors: [] };
  }

  const scored = items
    .map((item) => {
      const rel = focus
        ? scoreTenderRelevance(tenderForRelevanceScoring(item.tender), focus)
        : { score: 40, excluded: false, reason: "" };
      return { item, rel };
    })
    .filter((row) => !row.rel.excluded && row.rel.score >= 12)
    .sort((a, b) => b.rel.score - a.rel.score)
    .slice(0, topN);

  if (scored.length === 0) {
    return { tenders: items.map((i) => i.tender), enriched: 0, errors: [] };
  }

  onProgress?.(`Разбор ТЗ из файлов: ${scored.length} лучших по профилю…`);

  const errors: string[] = [];
  const enrichedMap = new Map<string, ImportedTender>();

  const tzResults = await mapPool(
    scored,
    async ({ item }) => {
      try {
        await sleep(400);
        const details = await fetchNoticeDetails(item.entry.regNumber, item.entry.noticeType, {
          parseTzFiles: true,
        });
        const tender = toImportedTender(item.entry, details, item.entry.meta);
        if (details.tzParsedFromFile) {
          onProgress?.(`  ✓ ТЗ: ${item.entry.regNumber} (${details.productSpecs.length} поз.)`);
        }
        return { regNumber: item.entry.regNumber, tender, error: null as string | null };
      } catch (e) {
        return { regNumber: item.entry.regNumber, tender: null, error: String(e) };
      }
    },
    Math.min(concurrency, 4)
  );

  let enriched = 0;
  for (const r of tzResults) {
    if (r.error || !r.tender) {
      errors.push(`${r.regNumber}: ${r.error}`);
      continue;
    }
    enrichedMap.set(r.regNumber, r.tender);
    enriched++;
  }

  const tenders = items.map((item) => enrichedMap.get(item.entry.regNumber) ?? item.tender);
  return { tenders, enriched, errors };
}

export async function importMedicalTendersFromEis(options: ImportOptions = {}): Promise<ImportResult> {
  const limit = options.limit ?? 30;
  const recordsPerQuery = options.recordsPerQuery ?? 8;
  const searchPages = options.searchPages ?? 1;
  const concurrency = options.concurrency ?? 3;
  const medicalOnly = options.medicalOnly ?? true;
  const parseTzFiles = options.parseTzFiles !== false;
  const fastImport = options.fastImport === true;
  const smartMode = options.smartMode === true;
  const tzTopN = options.tzTopN ?? 50;

  const allEntries = new Map<string, ZakupkiSearchEntry & { meta: { category: string; okved: string } }>();

  const searchQueries = mergeSearchQueries(options.searchQueries);
  const searchSleepMs = fastImport ? 120 : smartMode ? 200 : parseTzFiles ? 350 : 180;
  options.onProgress?.(
    `Поиск: ${searchQueries.length} запросов × ${searchPages} стр. (до ${searchQueries.length * searchPages * recordsPerQuery} карточек)`
  );

  for (const q of searchQueries) {
    for (let page = 1; page <= searchPages; page++) {
      try {
        options.onProgress?.(`Поиск: «${q.query}» стр. ${page}`);
        const found = await searchZakupki(q.query, page, recordsPerQuery);
        for (const entry of found) {
          if (!allEntries.has(entry.regNumber)) {
            allEntries.set(entry.regNumber, { ...entry, meta: { category: q.category, okved: q.okved } });
          }
        }
        await sleep(searchSleepMs);
        if (found.length < recordsPerQuery) break;
      } catch (e) {
        options.onProgress?.(`Ошибка поиска «${q.query}» стр. ${page}: ${e}`);
        break;
      }
    }
  }

  const errors: string[] = [];
  const tenders: ImportedTender[] = [];

  const sortedEntries = [...allEntries.values()].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );

  if (fastImport) {
    options.onProgress?.(
      `Быстрый импорт: до ${limit} из ${sortedEntries.length} найденных в поиске ЕИС`
    );

    for (const entry of sortedEntries) {
      if (tenders.length >= limit) break;
      if (entry.status && /заверш|отмен|недейств/i.test(entry.status)) continue;
      if (medicalOnly && !looksMedicalFromSearch(entry, entry.meta)) continue;
      tenders.push(toImportedTenderFromSearch(entry, entry.meta));
    }

    return {
      imported: tenders.length,
      updated: 0,
      skipped: sortedEntries.length - tenders.length,
      errors,
      scanned: allEntries.size,
      tenders,
    };
  }

  const candidates = sortedEntries.slice(0, limit);

  const noticePass = smartMode ? false : parseTzFiles;
  options.onProgress?.(
    smartMode
      ? `Умная загрузка: ${candidates.length} карточек ЕИС, затем ТЗ для топ-${tzTopN} по профилю`
      : `Загрузка карточек: ${candidates.length} закупок${noticePass ? " + ТЗ" : " (без файлов ТЗ)"}`
  );

  const detailsList = await mapPool(
    candidates,
    async (entry) => {
      try {
        await sleep(smartMode ? 140 : noticePass ? 300 : 120);
        const details = await fetchNoticeDetails(entry.regNumber, entry.noticeType, {
          parseTzFiles: noticePass,
        });
        if (details.tzParsedFromFile) {
          options.onProgress?.(`  ✓ ТЗ из файла: ${entry.regNumber} (${details.productSpecs.length} хар-к)`);
        }
        return { entry, details, error: null as string | null };
      } catch (e) {
        return { entry, details: null, error: String(e) };
      }
    },
    concurrency
  );

  const importRows: Array<{
    entry: ZakupkiSearchEntry & { meta: { category: string; okved: string } };
    tender: ImportedTender;
  }> = [];

  for (const item of detailsList) {
    if (item.error || !item.details) {
      errors.push(`${item.entry.regNumber}: ${item.error}`);
      continue;
    }

    if (
      medicalOnly &&
      !item.details.isMedical &&
      !looksMedicalFromSearch(item.entry, item.entry.meta)
    ) {
      continue;
    }

    if (item.entry.status && /заверш|отмен|недейств/i.test(item.entry.status)) {
      continue;
    }

    importRows.push({
      entry: item.entry,
      tender: toImportedTender(item.entry, item.details, item.entry.meta),
    });
  }

  let tzEnriched = 0;
  let noticeEnriched = importRows.length;

  if (smartMode && importRows.length > 0) {
    const tzPass = await enrichTopTendersWithTzFiles(
      importRows,
      options.companyFocus,
      tzTopN,
      concurrency,
      options.onProgress
    );
    errors.push(...tzPass.errors);
    tzEnriched = tzPass.enriched;
    tenders.push(...tzPass.tenders);
  } else {
    tenders.push(...importRows.map((r) => r.tender));
  }

  return {
    imported: tenders.length,
    updated: 0,
    skipped: candidates.length - tenders.length,
    errors,
    scanned: allEntries.size,
    tenders,
    tzEnriched: smartMode ? tzEnriched : undefined,
    noticeEnriched: smartMode ? noticeEnriched : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

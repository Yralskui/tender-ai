/**
 * AI анализ документов и матчинг тендеров.
 * PDF: pdf-parse v2 → Groq читает реальный текст.
 * Изображения: Groq Vision.
 */

import Groq from "groq-sdk";
import { readFile } from "fs/promises";
import path from "path";
import { renderPdfPages } from "./pdfRender";
import {
  getGroqRateLimitRetryMinutes,
  isGroqRateLimitError,
  isGroqRateLimited,
  isGroqTenderMatchEnabled,
  markGroqRateLimited,
} from "./groqRateLimit";
import {
  mergeRuCatalogProducts,
  extractRuAnnexProducts,
  extractRuCatalogItems,
  catalogItemsToDisplayStrings,
} from "./ruAnnexParser";
import type { StructuredCatalogItem } from "./productDimensions";
import { structuredItemFromRuLine } from "./productDimensions";

export { getGroqRateLimitRetryMinutes, isGroqRateLimited, isGroqTenderMatchEnabled } from "./groqRateLimit";
export const isAIEnabled = !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
export const aiProvider = process.env.GROQ_API_KEY ? "groq" : process.env.GEMINI_API_KEY ? "gemini" : "none";

/** Groq: llama-3.2-*-vision-preview сняты с поддержки → Llama 4 Scout */
const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const PDF_VISION_MAX_PAGES = 8;
const PDF_VISION_MAX_PAGES_RU = 12;

export type DocTypeCode =
  | "license_fsb"
  | "license_fstec"
  | "license_sro"
  | "license_mchs"
  | "certificate"
  | "medical_ru"
  | "balance"
  | "egrul"
  | "contracts"
  | "other"
  | "irrelevant";

export type DocumentScope = "catalog" | "single_product" | "corporate";

export interface DocumentAnalysis {
  docType: DocTypeCode;
  docTypeLabel: string;
  issuedTo: string;
  issuedBy: string;
  number: string;
  validFrom: string | null;
  validUntil: string | null;
  summary: string;
  isRelevantForTenders: boolean;
  warning: string | null;
  confidence: number;
  detectedContent: string;
  /** Перечень товаров/изделий (из РУ, приложения, сертификата) */
  products: string[];
  /** Структурированный каталог: размеры в мм для сверки с ТЗ */
  catalogItems: StructuredCatalogItem[];
  productCount: number;
  documentScope: DocumentScope;
  okpd2Code: string | null;
}

const DOC_TYPE_LABELS: Record<DocTypeCode, string> = {
  license_fsb: "Лицензия ФСБ",
  license_fstec: "Лицензия ФСТЭК",
  license_sro: "Допуск СРО",
  license_mchs: "Лицензия МЧС",
  certificate: "Сертификат / декларация соответствия",
  medical_ru: "Регистрационное удостоверение (РУ) на мед. изделия",
  balance: "Бухгалтерский баланс",
  egrul: "Выписка ЕГРЮЛ",
  contracts: "Реестр контрактов ЕИС",
  other: "Другой документ",
  irrelevant: "Не подходит для тендеров",
};

const GROQ_JSON_SCHEMA = `{
  "docTypeCode": "один из: license_fsb | license_fstec | license_sro | license_mchs | certificate | medical_ru | balance | egrul | contracts | irrelevant | other",
  "docTypeLabel": "человекочитаемое название типа на русском",
  "issuedTo": "название организации ООО/АО/ИП или пустая строка",
  "issuedBy": "кем выдан (Росздравнадзор, Росстандарт, ФСБ и т.д.) или пустая строка",
  "number": "номер документа (например ФСР 2012/13821) или пустая строка",
  "validFrom": "ДД.ММ.ГГГГ или null",
  "validUntil": "ДД.ММ.ГГГГ или бессрочно или null",
  "summary": "1-2 предложения: что это за документ",
  "detectedContent": "что реально внутри документа",
  "products": ["перечень товаров/изделий — до 40 позиций из текста и приложения"],
  "productCount": число позиций в перечне,
  "documentScope": "catalog | single_product | corporate",
  "okpd2Code": "код ОКПД2 если указан, иначе null",
  "isRelevantForTenders": true если официальный корпоративный документ для 44-ФЗ,
  "confidence": число 0-100,
  "warning": "предупреждение если не подходит или ограничения; иначе null"
}`;

const GROQ_SYSTEM = `Ты эксперт по госзакупкам России (44-ФЗ). Анализируешь РЕАЛЬНОЕ содержимое файла.

РЕГИСТРАЦИОННОЕ УДОСТОВЕРЕНИЕ (РУ) НА МЕДИЦИНСКОЕ ИЗДЕЛИЕ — ОБЯЗАТЕЛЬНО ПРИНИМАТЬ:
- Выдаёт Росздравнадзор (Федеральная служба по надзору в сфере здравоохранения)
- Заголовок: «РЕГИСТРАЦИОННОЕ УДОСТОВЕРЕНИЕ НА МЕДИЦИНСКОЕ ИЗДЕЛИЕ»
- Номер вида ФСР 2012/13821
- docTypeCode: medical_ru, documentScope: catalog, isRelevantForTenders: true
- Извлеки ВСЕ изделия из текста и приложения (комплекты, шприцы, перчатки, бельё медицинское, катетеры и т.д.)
- Если на странице только общее название, а приложение отдельно — укажи общую группу и отметь в summary что полный перечень в приложении

РАЗЛИЧАЙ ТИПЫ:
- medical_ru + catalog = РУ Росздравнадзора — каталог товаров поставщика (главный документ для медтендеров)
- certificate + single_product = сертификат/декларация ГОСТ на ОДИН товар (valid, warning: «подтверждает только 1 позицию»)
- corporate = лицензия, выписка ЕГРЮЛ, баланс

isRelevantForTenders=false:
- учебники, ЕГЭ, конспекты, личные документы, спорт/РУСАДА, мусор, бессмысленный текст

isRelevantForTenders=true:
- лицензии, СРО, сертификаты ГОСТ, РУ Росздравнадзора (номер ФСР или РЗН), выписка ЕГРЮЛ, баланс, реестр контрактов

СЕРТИФИКАТ С ПРИЛОЖЕНИЕМ (перечень продукции):
- «ПРИЛОЖЕНИЕ к сертификату соответствия», таблица с наименованиями комплектов
- docTypeCode: certificate, documentScope: catalog (НЕ single_product!)
- Извлеки ВСЕ позиции из таблицы на всех страницах

РУ нового формата: номер РЗН 2025-25693 (не только ФСР) — тоже medical_ru.

НЕ доверяй названию файла — только содержимое. Скан со штампом — принимай даже при коротком OCR.

Отвечай строго JSON без markdown.`;

const EMPTY_PRODUCT_FIELDS = {
  products: [] as string[],
  catalogItems: [] as StructuredCatalogItem[],
  productCount: 0,
  documentScope: "corporate" as DocumentScope,
  okpd2Code: null as string | null,
};

function catalogItemsFromProducts(products: string[]): StructuredCatalogItem[] {
  return products.map(structuredItemFromRuLine);
}

function parseProductsFromRaw(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.products)) return [];
  return (raw.products as unknown[])
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 40);
}

function parseDocumentScope(raw: Record<string, unknown>, code: DocTypeCode): DocumentScope {
  const scope = String(raw.documentScope || "").toLowerCase();
  if (scope === "catalog" || scope === "single_product" || scope === "corporate") return scope;
  if (code === "medical_ru") return "catalog";
  if (code === "certificate") return "single_product";
  return "corporate";
}

function isMedicalRuText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    (/регистрационн.*удостоверен|росздравнадзор|федеральн.*служб.*здрав/i.test(lower) &&
      /медицинск|мед\.?\s*изделие|фср\s*\d|фср\s*20\d|рзн\s*\d/i.test(lower)) ||
    /регистрационное удостоверение на медицинское изделие/i.test(lower) ||
    /рзн\s*\d{4}[-/]\d+/i.test(lower) ||
    (/\bру\b/i.test(lower) && /рзн|медицинск|комплект/i.test(lower))
  );
}

function isCatalogCertificateText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /приложени.*сертификат|перечень.*продукц|сертификат.*соответств/i.test(lower) ||
    (/сертификат/i.test(lower) && /комплект|наименован.*продукц/i.test(lower))
  );
}

function isGroqEmptyRejection(analysis: DocumentAnalysis): boolean {
  const blob = `${analysis.summary} ${analysis.detectedContent} ${analysis.warning || ""}`.toLowerCase();
  return (
    !analysis.isRelevantForTenders &&
    (/пуст|не содержит.*текст|никакого текста|недействительн|пустой документ/i.test(blob))
  );
}

interface FilenameHints {
  likelyMedicalRu: boolean;
  likelyCertificate: boolean;
  rzNumber: string | null;
  fsrNumber: string | null;
  productsFromName: string[];
}

function extractFilenameHints(fileName: string): FilenameHints {
  const lower = fileName.toLowerCase();
  const rzMatch = fileName.match(/рзн[\s№#:_-]*(\d{4}[-_/\s]?\d+)/i);
  const fsrMatch = fileName.match(/фср[\s№#:]*(\d{4}[\s/\-_]*\d+)/i);
  const productsFromName: string[] = [];

  const productPart = fileName
    .replace(/\.(pdf|jpg|png|jpeg|webp)$/i, "")
    .replace(/^загрузить\s*:\s*/i, "")
    .replace(/^.*\d{4}[.\-/]\d{2}[.\-/]\d{2}\s*$/i, "")
    .replace(/^.*рзн[\s№#:_-]*\d{4}[-_/\s]?\d+\s*(от\s*\d{2}[.\-/]\d{2}[.\-/]\d{2,4}\s*)?/i, "")
    .replace(/^.*фср[\s№#:]*\d{4}[\s/\-_]*\d+\s*/i, "")
    .replace(/^.*сертификат[^.]*\s*(к\s*)?/i, "")
    .replace(/^ру\s*/i, "")
    .replace(/\s*от\s*\d{2}[.\-/]\d{2}[.\-/]\d{2,4}\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/i, "")
    .trim();

  if (productPart.length > 5 && !/^загрузить/i.test(productPart)) {
    productsFromName.push(productPart.replace(/[+]/g, ", "));
  }
  if (/комплект|к-ты/i.test(lower)) productsFromName.push("комплекты медицинские");
  if (/хирург/i.test(lower)) productsFromName.push("комплекты одежды и белья хирургические");
  if (/бель/i.test(lower)) productsFromName.push("комплект белья хирургический");
  if (/рулон/i.test(lower)) productsFromName.push("рулоны");
  if (/стер/i.test(lower)) productsFromName.push("стерильные изделия");

  const isCert = /сертификат|ст-1|декларац|соответств/i.test(lower);
  const isRu =
    !isCert &&
    (/(?:^|[\s:_])ру(?:[\s\d]|$|[\s:._-])/.test(lower) ||
      /рзн|регистрацион/i.test(lower) ||
      /фср\s*20\d/i.test(lower) ||
      (/к-ты?\s+хирург|медицинск|медиздел/i.test(lower) && /фср|рзн|ру/.test(lower)));

  return {
    likelyMedicalRu: isRu,
    likelyCertificate: isCert,
    rzNumber: rzMatch ? `РЗН ${rzMatch[1].replace(/\s+/g, "-")}` : null,
    fsrNumber: fsrMatch ? `ФСР ${fsrMatch[1].replace(/\s+/g, "/")}` : null,
    productsFromName: [...new Set(productsFromName)],
  };
}

function buildAnalysisFromFilenameHints(hints: FilenameHints, fileName: string, userType: string): DocumentAnalysis | null {
  if (!hints.likelyMedicalRu && !hints.likelyCertificate) return null;

  if (hints.likelyMedicalRu) {
    const number = hints.rzNumber || hints.fsrNumber || "";
    const productHint = hints.productsFromName.length
      ? ` Изделия: ${hints.productsFromName.slice(0, 3).join("; ")}.`
      : "";
    return withProductDefaults({
      docType: "medical_ru",
      docTypeLabel: DOC_TYPE_LABELS.medical_ru,
      issuedTo: "",
      issuedBy: "Росздравнадзор",
      number,
      validFrom: null,
      validUntil: null,
      summary: `Регистрационное удостоверение${number ? ` ${number}` : ""} на медицинские изделия.${productHint}`,
      detectedContent: `РУ медизделий: ${fileName.slice(0, 100)}`,
      isRelevantForTenders: true,
      warning:
        "AI не смог полностью прочитать скан — документ принят по реквизитам из названия. Загрузите PDF со всеми страницами приложения (перечень изделий) для точного матчинга с ТЗ.",
      confidence: 72,
      documentScope: "catalog",
      products: hints.productsFromName,
      productCount: hints.productsFromName.length,
    });
  }

  return withProductDefaults({
    docType: "certificate",
    docTypeLabel: DOC_TYPE_LABELS.certificate,
    issuedTo: "",
    issuedBy: "",
    number: hints.rzNumber ? `к ${hints.rzNumber}` : "",
    validFrom: null,
    validUntil: null,
    summary: `Сертификат соответствия с приложением (перечень продукции)${hints.rzNumber ? `, ${hints.rzNumber}` : ""}.`,
    detectedContent: `Сертификат: ${fileName.slice(0, 80)}`,
    isRelevantForTenders: true,
    warning: hints.productsFromName.length
      ? null
      : "Скан не прочитан — проверьте что загружены все страницы приложения с перечнем.",
    confidence: 65,
    documentScope: "catalog",
    products: hints.productsFromName,
    productCount: hints.productsFromName.length,
  });
}

function mergePageAnalyses(pages: DocumentAnalysis[], fileName: string, hints: FilenameHints): DocumentAnalysis {
  const relevant = pages.filter((p) => p.isRelevantForTenders);
  const pool = relevant.length > 0 ? relevant : pages;
  const base = pool.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best), pool[0]);

  const allProducts = [...new Set(pool.flatMap((p) => p.products).filter(Boolean))];
  const pageText = pool.map((p) => p.detectedContent).join("\n");
  const mergedProducts = mergeRuCatalogProducts(
    allProducts.length > 0 ? allProducts : hints.productsFromName,
    pageText
  );
  const annexItems = extractRuCatalogItems(pageText);
  const catalogItems =
    annexItems.length > 0
      ? annexItems
      : catalogItemsFromProducts(mergedProducts);

  let docType = base.docType;
  if (docType === "irrelevant" || docType === "other") {
    if (hints.likelyMedicalRu) docType = "medical_ru";
    else if (hints.likelyCertificate) docType = "certificate";
  }

  const documentScope: DocumentScope =
    mergedProducts.length > 1 || isCatalogCertificateText(pool.map((p) => p.detectedContent).join(" "))
      ? "catalog"
      : base.documentScope;

  const number = base.number || hints.rzNumber || hints.fsrNumber || "";

  return postValidateAnalysis(
    {
      ...base,
      docType,
      docTypeLabel: DOC_TYPE_LABELS[docType],
      isRelevantForTenders: docType !== "irrelevant",
      products: catalogItems.length ? catalogItemsToDisplayStrings(catalogItems) : mergedProducts,
      catalogItems,
      productCount: catalogItems.length || mergedProducts.length,
      documentScope,
      number,
      detectedContent: base.detectedContent || `Проанализирован скан PDF, ${pages.length} стр. (AI Vision)`,
      summary: base.summary || `Документ проанализирован по ${pages.length} страницам.`,
    },
    [base.detectedContent, base.summary, ...mergedProducts, fileName].join(" "),
    fileName
  );
}

function extractMainProductFromRuText(text: string): string | null {
  const match = text.match(/на\s+медицинск(?:ое|ие)?\s+изделие[:\s«"„]*([^»"„\n]{10,250})/i);
  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

function applyMedicalRuOverrides(analysis: DocumentAnalysis, text: string): DocumentAnalysis {
  if (!isMedicalRuText(text) && analysis.docType !== "medical_ru") return analysis;

  const mainProduct = extractMainProductFromRuText(text);
  const annexProducts = extractRuAnnexProducts(text);
  const annexItems = extractRuCatalogItems(text);
  const baseProducts = mergeRuCatalogProducts(
    analysis.products.length ? analysis.products : mainProduct ? [mainProduct] : [],
    text
  );
  const catalogItems =
    annexItems.length > 0
      ? annexItems
      : analysis.catalogItems?.length
        ? analysis.catalogItems
        : catalogItemsFromProducts(baseProducts);
  const products = catalogItems.length ? catalogItemsToDisplayStrings(catalogItems) : baseProducts;

  const hasAnnex = /приложени/i.test(text);
  const annexNote =
    hasAnnex && annexProducts.length === 0 && products.length <= 3
      ? " Полный перечень изделий — в приложении к РУ (перезагрузите PDF со всеми страницами)."
      : annexProducts.length > 0
        ? ` В каталоге ${products.length} позиций из приложения (размеры переведены в мм для сверки с ТЗ).`
        : "";

  return {
    ...analysis,
    docType: "medical_ru",
    docTypeLabel: DOC_TYPE_LABELS.medical_ru,
    isRelevantForTenders: true,
    documentScope: "catalog",
    products,
    catalogItems,
    productCount: products.length,
    issuedBy: analysis.issuedBy || (/росздравнадзор/i.test(text) ? "Росздравнадзор" : analysis.issuedBy),
    warning:
      annexProducts.length === 0 && hasAnnex
        ? "Приложение к РУ распознано не полностью — нажмите «Перепроверить» или загрузите чёткий PDF всех страниц."
        : analysis.warning,
    summary: (analysis.summary || "Регистрационное удостоверение на медицинские изделия.") + annexNote,
    confidence: Math.max(analysis.confidence, annexProducts.length > 5 ? 92 : 88),
  };
}

function normalizeDocTypeCode(raw: string | undefined, userType: string): DocTypeCode {
  const lower = (raw || "").toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, DocTypeCode> = {
    license_fsb: "license_fsb",
    license_fstec: "license_fstec",
    license_sro: "license_sro",
    license_mchs: "license_mchs",
    certificate: "certificate",
    medical_ru: "medical_ru",
    balance: "balance",
    egrul: "egrul",
    contracts: "contracts",
    irrelevant: "irrelevant",
    other: "other",
  };
  if (map[lower]) return map[lower];

  const text = (raw || "").toLowerCase();
  if (text.includes("егрюл") || text.includes("юридических лиц")) return "egrul";
  if (text.includes("фсб")) return "license_fsb";
  if (text.includes("фстэк")) return "license_fstec";
  if (text.includes("сро")) return "license_sro";
  if (text.includes("мчс") || text.includes("пожар")) return "license_mchs";
  if (
    text.includes("регистрационн") && (text.includes("удостоверен") || text.includes("медицинск"))
  ) return "medical_ru";
  if (text.includes("росздравнадзор") || text.includes("фср") || text.includes("рзн") || (text.includes("медицинск") && text.includes("изделие"))) {
    return "medical_ru";
  }
  if (text.includes("сертификат") || text.includes("декларац") || text.includes("гост")) return "certificate";
  if (text.includes("баланс") || text.includes("бухгалтер")) return "balance";
  if (text.includes("контракт") || text.includes("еис")) return "contracts";
  if (
    text.includes("егэ") || text.includes("огэ") || text.includes("учеб") ||
    text.includes("личн") || text.includes("спорт") || text.includes("диплом") ||
    text.includes("курсов") || text.includes("реферат") || text.includes("задач")
  ) return "irrelevant";

  const validUser = userType as DocTypeCode;
  if (["license_fsb", "license_fstec", "license_sro", "license_mchs", "certificate", "medical_ru", "balance", "egrul", "contracts"].includes(validUser)) {
    return validUser;
  }
  return "other";
}

function buildAnalysisFromGroq(
  raw: Record<string, unknown>,
  userType: string,
  fallbackWarning?: string | null
): DocumentAnalysis {
  const isRelevant = raw.isRelevantForTenders === true;
  const code = isRelevant
    ? normalizeDocTypeCode(String(raw.docTypeCode || raw.docType || ""), userType)
    : "irrelevant";

  const products = parseProductsFromRaw(raw);
  const catalogItems = catalogItemsFromProducts(products);
  let documentScope = parseDocumentScope(raw, code);
  if (code === "certificate" && (products.length > 1 || isCatalogCertificateText(String(raw.detectedContent || raw.summary || "")))) {
    documentScope = "catalog";
  }
  const productCount = Math.max(Number(raw.productCount) || 0, products.length);
  const okpd2Code = raw.okpd2Code ? String(raw.okpd2Code) : null;

  let finalWarning =
    (typeof raw.warning === "string" && raw.warning) ||
    fallbackWarning ||
    (!isRelevant
      ? `Это не корпоративный документ для госзакупок. ${String(raw.detectedContent || raw.summary || "Содержимое не соответствует требованиям 44-ФЗ.")}`
      : null);

  if (isRelevant && code === "certificate" && documentScope === "single_product" && products.length <= 1 && !finalWarning) {
    finalWarning =
      "Сертификат подтверждает только одну позицию. Для медицинских тендеров загрузите РУ Росздравнадзора с приложением — там перечень всех изделий поставщика.";
  }

  return {
    docType: code,
    docTypeLabel: String(raw.docTypeLabel || DOC_TYPE_LABELS[code]),
    issuedTo: String(raw.issuedTo || ""),
    issuedBy: String(raw.issuedBy || ""),
    number: String(raw.number || ""),
    validFrom: raw.validFrom ? String(raw.validFrom) : null,
    validUntil: raw.validUntil ? String(raw.validUntil) : null,
    summary: String(raw.summary || ""),
    detectedContent: String(raw.detectedContent || raw.summary || ""),
    isRelevantForTenders: isRelevant,
    warning: finalWarning,
    confidence: Math.min(100, Math.max(0, Number(raw.confidence) || 70)),
    products,
    catalogItems,
    productCount,
    documentScope,
    okpd2Code,
  };
}

const OFFICIAL_MARKERS = [
  /лицензи/i, /выдан/i, /выдана/i, /сертификат/i, /декларац/i,
  /егрюл/i, /огрн/i, /инн/i, /ооо|ао|зао|ип/i, /фстэк|фсб|мчс|росстандарт/i,
  /бухгалтерск/i, /баланс/i, /контракт/i, /реестр/i, /гост/i,
  /росздравнадзор/i, /медицинск.*изделие/i, /регистрационн.*удостоверен/i, /фср/i, /рзн/i,
  /№\s*\d/i, /номер/i,
];

/** Пост-проверка: нельзя принять «лицензию» из 3 строк бессмыслицы */
function postValidateAnalysis(
  analysis: DocumentAnalysis,
  text: string,
  fileName: string
): DocumentAnalysis {
  const trimmed = text.trim();
  const lower = `${trimmed}\n${fileName}`.toLowerCase();
  const officialTypes: DocTypeCode[] = [
    "license_fsb", "license_fstec", "license_sro", "license_mchs",
    "certificate", "medical_ru", "balance", "egrul", "contracts",
  ];

  if (!analysis.isRelevantForTenders) {
    const hints = extractFilenameHints(fileName);
    if (isGroqEmptyRejection(analysis) && (hints.likelyMedicalRu || hints.likelyCertificate)) {
      const fallback = buildAnalysisFromFilenameHints(hints, fileName, analysis.docType);
      if (fallback) return fallback;
    }
    if (isMedicalRuText(lower)) return applyMedicalRuOverrides(analysis, lower);
    if (isCatalogCertificateText(lower) || hints.likelyCertificate) {
      return withProductDefaults({
        ...analysis,
        docType: "certificate",
        docTypeLabel: DOC_TYPE_LABELS.certificate,
        isRelevantForTenders: true,
        documentScope: "catalog",
        products: analysis.products.length ? analysis.products : hints.productsFromName,
        productCount: Math.max(analysis.productCount, hints.productsFromName.length),
        warning: analysis.products.length ? null : "Загрузите все страницы приложения с перечнем продукции.",
        confidence: Math.max(analysis.confidence, 75),
      });
    }
    return analysis;
  }

  // РУ Росздравнадзора — принимаем по штампу/номеру ФСР или РЗН даже при коротком OCR
  if (analysis.docType === "medical_ru" || isMedicalRuText(lower)) {
    const upgraded = applyMedicalRuOverrides(analysis, lower);
    const hints = extractFilenameHints(fileName);
    if (
      upgraded.number.length > 2 ||
      /фср|рзн/i.test(lower) ||
      upgraded.issuedBy.toLowerCase().includes("росздрав") ||
      upgraded.issuedTo.length > 3 ||
      hints.rzNumber ||
      hints.fsrNumber
    ) {
      return upgraded;
    }
  }

  if (analysis.docType === "certificate" && (isCatalogCertificateText(lower) || analysis.products.length > 1)) {
    return { ...analysis, documentScope: "catalog" as DocumentScope, warning: analysis.warning };
  }

  const markerCount = OFFICIAL_MARKERS.filter((re) => re.test(lower)).length;
  const hasIssuer = analysis.issuedBy.length > 3;
  const hasNumber = analysis.number.length > 2;
  const hasOrg = analysis.issuedTo.length > 3;

  // Скан с реквизитами (Vision/OCR) — не отклоняем по длине сырого текста
  if (officialTypes.includes(analysis.docType) && hasIssuer && hasNumber && hasOrg) {
    return analysis;
  }

  // Слишком мало текста — но РУ/сертификат по имени файла или номеру ФСР/РЗН
  if (officialTypes.includes(analysis.docType) && trimmed.length < 200) {
    const hints = extractFilenameHints(fileName);
    if (hints.likelyMedicalRu && (hints.fsrNumber || hints.rzNumber || analysis.docType === "medical_ru")) {
      return applyMedicalRuOverrides(
        {
          ...analysis,
          isRelevantForTenders: true,
          number: analysis.number || hints.fsrNumber || hints.rzNumber || "",
          issuedBy: analysis.issuedBy || "Росздравнадзор",
          products: analysis.products.length ? analysis.products : hints.productsFromName,
        },
        lower
      );
    }
    if (hints.likelyMedicalRu || hints.likelyCertificate) {
      const fallback = buildAnalysisFromFilenameHints(hints, fileName, analysis.docType);
      if (fallback) return fallback;
    }
    return rejectAsFake(
      analysis,
      `В файле всего ${trimmed.length} символов — настоящая ${analysis.docTypeLabel} занимает страницу и содержит номер, орган выдачи и реквизиты. Это не официальный документ.`
    );
  }

  // Нет признаков официального документа
  if (officialTypes.includes(analysis.docType) && markerCount < 2 && !hasIssuer && !hasNumber) {
    return rejectAsFake(
      analysis,
      `Содержимое не похоже на ${analysis.docTypeLabel}: нет номера, органа выдачи, реквизитов. Название файла «${fileName}» не заменяет настоящий документ.`
    );
  }

  // AI уверен слабо и нет реквизитов
  if (officialTypes.includes(analysis.docType) && analysis.confidence < 65 && !hasIssuer && !hasOrg) {
    return rejectAsFake(
      analysis,
      `AI не уверен, что это настоящий документ (уверенность ${analysis.confidence}%). Загрузите полный скан или PDF с текстовым слоем.`
    );
  }

  return analysis;
}

function rejectAsFake(analysis: DocumentAnalysis, reason: string): DocumentAnalysis {
  return {
    ...analysis,
    ...EMPTY_PRODUCT_FIELDS,
    docType: "irrelevant",
    docTypeLabel: DOC_TYPE_LABELS.irrelevant,
    isRelevantForTenders: false,
    warning: reason,
    summary: reason,
    detectedContent: analysis.detectedContent || "Содержимое не соответствует официальному документу",
    confidence: Math.min(analysis.confidence, 40),
  };
}

function withProductDefaults(partial: Omit<DocumentAnalysis, keyof typeof EMPTY_PRODUCT_FIELDS> & Partial<typeof EMPTY_PRODUCT_FIELDS>): DocumentAnalysis {
  return { ...EMPTY_PRODUCT_FIELDS, ...partial };
}

function unreadablePdfAnalysis(fileName: string): DocumentAnalysis {
  return withProductDefaults({
    docType: "irrelevant",
    docTypeLabel: DOC_TYPE_LABELS.irrelevant,
    issuedTo: "",
    issuedBy: "",
    number: "",
    validFrom: null,
    validUntil: null,
    summary: "Содержимое PDF не удалось прочитать.",
    detectedContent: "Текст не извлечён (скан без OCR или пустой файл)",
    isRelevantForTenders: false,
    warning: `Не удалось прочитать содержимое «${fileName}». Название файла (например «лицензия ФСТЭК») ничего не доказывает — нужен читаемый PDF или чёткий скан. Документ не учитывается в тендерах.`,
    confidence: 90,
  });
}

type PdfParser = {
  getText: (p?: { partial?: number[]; first?: number }) => Promise<{ text: string }>;
  getInfo: () => Promise<{ total: number }>;
  getScreenshot: (p?: { partial?: number[]; first?: number; scale?: number; desiredWidth?: number }) => Promise<{ pages: Array<{ data: Uint8Array; dataUrl: string }> }>;
  destroy: () => Promise<void>;
};

async function loadPDFParse() {
  const mod = await import("pdf-parse");
  const PDFParse = (mod as { PDFParse: new (opts: { data: Buffer }) => PdfParser }).PDFParse;
  if (!PDFParse) throw new Error("PDFParse export not found");
  return PDFParse;
}

/** Текст явно бессмысленный — не лицензия */
function detectGibberishText(text: string): string | null {
  const lower = text.toLowerCase();
  if (isMedicalRuText(lower)) return null;
  if (/билебер|билибер|ааптмаш|епруец|пукпук|амифаз/i.test(lower)) {
    return "В документе бессмысленный текст. Это не официальный документ для тендеров.";
  }
  if (/конспект|лекци[яи]\s|учебн.*пособ|методич|шпаргалк/i.test(lower)) {
    return "Это учебный конспект или методичка — не корпоративный документ для госзакупок.";
  }
  const markerCount = OFFICIAL_MARKERS.filter((re) => re.test(lower)).length;
  if (markerCount >= 2) return null;

  const words = lower.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 5) return null;

  const garbageWords = words.filter(
    (w) => /\d{4,}/.test(w) || /^[бвгджзйклмнпрстфхцчшщ]{7,}$/i.test(w) || (w.length > 12 && !/[аеёиоуыэюя]{2}/i.test(w))
  );
  if (garbageWords.length / words.length > 0.35) {
    return "Текст в файле — случайные буквы и цифры без номера лицензии, органа выдачи и реквизитов. Это не официальный документ.";
  }
  return null;
}

function gibberishAnalysis(text: string, fileName: string, reason: string): DocumentAnalysis {
  return withProductDefaults({
    docType: "irrelevant",
    docTypeLabel: DOC_TYPE_LABELS.irrelevant,
    issuedTo: "",
    issuedBy: "",
    number: "",
    validFrom: null,
    validUntil: null,
    summary: reason,
    detectedContent: `Бессмысленный текст: ${text.slice(0, 120).replace(/\s+/g, " ")}…`,
    isRelevantForTenders: false,
    warning: reason,
    confidence: 95,
  });
}

/** pdf-parse v2 — текст */
async function extractTextFromPdf(filePath: string): Promise<string | null> {
  try {
    const buffer = await readFile(filePath);
    const PDFParse = await loadPDFParse();
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text?.trim() || "";
    return text.length > 0 ? text : null;
  } catch (e) {
    console.error("pdf-parse getText error:", e);
    return null;
  }
}

/** Одна страница скана → Groq Vision */
async function analyzePageImageWithVision(
  imageUrl: string,
  fileName: string,
  userType: string,
  pageNum: number,
  totalPages: number
): Promise<DocumentAnalysis | null> {
  if (!process.env.GROQ_API_KEY) return null;
  if (isGroqRateLimited()) return null;
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: GROQ_VISION_MODEL,
      messages: [
        { role: "system", content: GROQ_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `СКАН страницы ${pageNum} из ${totalPages} официального документа.
Название файла (подсказка): ${fileName}
Тип от пользователя: ${userType}

Прочитай ВЕСЬ текст на странице, включая таблицы и мелкий шрифт.
- РУ Росздравнадзора (ФСР или РЗН) → medical_ru, catalog, isRelevantForTenders: true
- Заголовок «РЕГИСТРАЦИОННОЕ УДОСТОВЕРЕНИЕ НА МЕДИЦИНСКОЕ ИЗДЕЛИЕ» — всегда medical_ru
- Приложение к РУ с таблицей изделий → извлеки ВСЕ позиции со страницы
- Страница 1 — титул; страницы 2+ — часто приложение с перечнем комплектов

Верни JSON:
${GROQ_JSON_SCHEMA}`,
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 3500,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const built = buildAnalysisFromGroq(raw, userType);
    built.detectedContent = built.detectedContent || `Страница ${pageNum}/${totalPages} (AI Vision)`;
    return built;
  } catch (e) {
    if (isGroqRateLimitError(e)) {
      markGroqRateLimited(e);
      return null;
    }
    console.error(`Vision page ${pageNum} error:`, e);
    return null;
  }
}

/** Скан PDF — постранично через Vision (до 12 стр. для РУ с приложением) */
async function analyzePdfScanWithVision(
  filePath: string,
  fileName: string,
  userType: string,
  maxPages = PDF_VISION_MAX_PAGES
): Promise<DocumentAnalysis | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const hints = extractFilenameHints(fileName);

  try {
    const rendered = await renderPdfPages(filePath, maxPages);
    if (rendered.length === 0) {
      return buildAnalysisFromFilenameHints(hints, fileName, userType);
    }

    const pageAnalyses: DocumentAnalysis[] = [];
    const totalPages = rendered.length;
    const batchSize = 3;

    for (let i = 0; i < rendered.length; i += batchSize) {
      const batch = rendered.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((page) =>
          analyzePageImageWithVision(page.dataUrl, fileName, userType, page.pageNumber, totalPages)
        )
      );
      for (const pageAnalysis of batchResults) {
        if (pageAnalysis) pageAnalyses.push(pageAnalysis);
      }
    }

    if (pageAnalyses.length === 0) {
      return buildAnalysisFromFilenameHints(hints, fileName, userType);
    }

    return mergePageAnalyses(pageAnalyses, fileName, hints);
  } catch (e) {
    console.error("PDF vision error:", e);
    return buildAnalysisFromFilenameHints(hints, fileName, userType);
  }
}

async function callGroqJson(
  userContent: string | Groq.Chat.Completions.ChatCompletionContentPart[],
  options?: { model?: string; maxTokens?: number }
): Promise<Record<string, unknown> | null> {
  if (!process.env.GROQ_API_KEY) return null;
  if (isGroqRateLimited()) return null;

  const model = options?.model || process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
  const maxTokens = options?.maxTokens ?? 2000;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: GROQ_SYSTEM },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as Record<string, unknown>;
  } catch (e) {
    if (isGroqRateLimitError(e)) {
      markGroqRateLimited(e);
      return null;
    }
    console.error("Groq error:", e);
    return null;
  }
}

async function analyzeTextWithGroq(text: string, fileName: string, userType: string): Promise<DocumentAnalysis | null> {
  const truncated = text.slice(0, 8000);
  const medicalHint = isMedicalRuText(text)
    ? "\nПОДСКАЗКА: похоже на РУ Росздравнадзора — medical_ru, catalog, isRelevantForTenders: true, извлеки изделия.\n"
    : "";
  const shortDocWarning = text.length < 200 && !isMedicalRuText(text)
    ? `\nВАЖНО: в документе всего ${text.length} символов. Настоящая лицензия/выписка/сертификат — это полноценный документ с номером, органом выдачи, организацией. Короткий бессмысленный текст = isRelevantForTenders:false.\n`
    : "";

  const raw = await callGroqJson(
    `Проанализируй документ для участия в госзакупках.

Название файла (НЕ ДОВЕРЯЙ — может быть обман): ${fileName}
Пользователь указал тип: ${userType}
${medicalHint}${shortDocWarning}
РЕАЛЬНЫЙ ТЕКСТ ДОКУМЕНТА:
${truncated}

Верни JSON:
${GROQ_JSON_SCHEMA}`
  );
  if (!raw) return null;
  const built = buildAnalysisFromGroq(raw, userType);
  return postValidateAnalysis(built, text, fileName);
}

async function analyzeImageWithGroq(buffer: Buffer, fileName: string, mimeType: string, userType: string): Promise<DocumentAnalysis | null> {
  if (!process.env.GROQ_API_KEY) return null;
  if (isGroqRateLimited()) return null;
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const base64 = buffer.toString("base64");
    const completion = await groq.chat.completions.create({
      model: GROQ_VISION_MODEL,
      messages: [
        { role: "system", content: GROQ_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Посмотри на изображение. Это документ для госзакупок 44-ФЗ?
Название файла: ${fileName}
Пользователь указал тип: ${userType}

Если это РУ Росздравнадзора (регистрационное удостоверение на мед. изделие) — medical_ru, catalog, isRelevantForTenders: true.
Извлеки перечень изделий из текста и приложения.

Верни JSON:
${GROQ_JSON_SCHEMA}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2000,
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const built = buildAnalysisFromGroq(raw, userType, "Изображение не является корпоративным документом для тендеров.");
    const visionText = [built.detectedContent, built.summary, built.issuedBy, built.issuedTo, built.number, ...built.products].join(" ");
    return postValidateAnalysis(built, visionText, fileName);
  } catch (e) {
    if (isGroqRateLimitError(e)) {
      markGroqRateLimited(e);
      return null;
    }
    console.error("Groq vision error:", e);
    return null;
  }
}

async function analyzeByFilenameWithGroq(fileName: string, userType: string, hint: string): Promise<DocumentAnalysis> {
  // Без содержимого нельзя подтвердить документ — только отклоняем
  const raw = await callGroqJson(
    `Текст из файла извлечь не удалось. Содержимое НЕИЗВЕСТНО.

Название: ${fileName}
Пользователь указал тип: ${userType}
Подсказка: ${hint}

ПРАВИЛО: isRelevantForTenders ВСЕГДА false — без прочитанного содержимого нельзя принять документ.
Даже если файл называется «лицензия ФСТЭК» — это не доказательство.

Верни JSON с isRelevantForTenders: false и warning с объяснением.

${GROQ_JSON_SCHEMA}`
  );
  if (!raw) return unreadablePdfAnalysis(fileName);
  const built = buildAnalysisFromGroq(raw, userType, unreadablePdfAnalysis(fileName).warning);
  return {
    ...built,
    isRelevantForTenders: false,
    docType: "irrelevant",
    docTypeLabel: DOC_TYPE_LABELS.irrelevant,
    warning: built.warning || unreadablePdfAnalysis(fileName).warning,
  };
}

/** Fallback без AI — только явные признаки мусора */
function strictHeuristic(text: string, fileName: string, userType: string): DocumentAnalysis {
  const combined = `${text}\n${fileName}`.toLowerCase();

  const junkPatterns = [
    { re: /егэ|огэ|пробник|досрочн|вариант\s*\d|профиль\s*202/i, msg: "Это материал для подготовки к ЕГЭ/ОГЭ, а не корпоративный документ." },
    { re: /равномерн.*движен|окружност|физик|задач[аи]\s*№|формул/i, msg: "Это учебный материал по физике/математике, не документ для тендера." },
    { re: /конспект|методич|шпаргалк|учебн.*пособ/i, msg: "Это учебный конспект или методичка — не документ для участия в тендерах." },
    { re: /русада|rusada|антидопинг|допинг/i, msg: "Спортивный/антидопинговый документ — не используется в госзакупках." },
    { re: /паспорт.*серия|серия\s*\d{2}\s*№/i, msg: "Личный паспорт — нужны документы юридического лица." },
  ];

  for (const p of junkPatterns) {
    if (p.re.test(combined)) {
      return withProductDefaults({
        docType: "irrelevant",
        docTypeLabel: DOC_TYPE_LABELS.irrelevant,
        issuedTo: "",
        issuedBy: "",
        number: "",
        validFrom: null,
        validUntil: null,
        summary: p.msg,
        detectedContent: "Нерелевантное содержимое",
        isRelevantForTenders: false,
        warning: p.msg,
        confidence: 85,
      });
    }
  }

  if (isMedicalRuText(combined)) {
    const mainProduct = extractMainProductFromRuText(text);
    return withProductDefaults({
      docType: "medical_ru",
      docTypeLabel: DOC_TYPE_LABELS.medical_ru,
      issuedTo: "",
      issuedBy: "Росздравнадзор",
      number: "",
      validFrom: null,
      validUntil: null,
      summary: "Регистрационное удостоверение на медицинские изделия.",
      detectedContent: text.slice(0, 200),
      isRelevantForTenders: true,
      warning: /приложени/i.test(combined)
        ? "Загрузите все страницы РУ с приложением — там полный перечень изделий для точного подбора тендеров."
        : null,
      confidence: 75,
      documentScope: "catalog",
      products: mainProduct ? [mainProduct] : [],
      productCount: mainProduct ? 1 : 0,
    });
  }

  if (!text || text.length < 200) {
    const hints = extractFilenameHints(fileName);
    const fromName = buildAnalysisFromFilenameHints(hints, fileName, userType);
    if (fromName) return fromName;

    return withProductDefaults({
      docType: "irrelevant",
      docTypeLabel: DOC_TYPE_LABELS.irrelevant,
      issuedTo: "",
      issuedBy: "",
      number: "",
      validFrom: null,
      validUntil: null,
      summary: text ? `Слишком мало текста (${text.length} симв.) для официального документа.` : "Содержимое не прочитано.",
      detectedContent: text ? text.slice(0, 150) : "Пусто",
      isRelevantForTenders: false,
      warning: text
        ? `Текстовый слой PDF почти пустой (${text.length} симв.) — для сканов РУ используется распознавание страниц. Если ошибка повторится, загрузите PDF со всеми страницами приложения.`
        : "AI не смог прочитать документ. Загрузите PDF с текстовым слоем или чёткий скан всех страниц.",
      confidence: 80,
    });
  }

  const code = normalizeDocTypeCode("", userType);
  return withProductDefaults({
    docType: code,
    docTypeLabel: DOC_TYPE_LABELS[code],
    issuedTo: "",
    issuedBy: "",
    number: "",
    validFrom: null,
    validUntil: null,
    summary: `Документ загружен. AI недоступен — проверка ограничена.`,
    detectedContent: text.slice(0, 200),
    isRelevantForTenders: false,
    warning: "AI-анализ недоступен. Документ не будет учтён до повторной проверки.",
    confidence: 20,
  });
}

export type AnalyzeDocumentMode = "quick" | "full";

export interface AnalyzeDocumentOptions {
  /** quick — без Vision (секунды); full — полный разбор со сканами */
  mode?: AnalyzeDocumentMode;
}

/** Быстрый fallback: имя файла + текст PDF, без постраничного Vision */
export function analyzeDocumentFallback(
  fileName: string,
  docType: string,
  extractedText?: string | null
): DocumentAnalysis {
  const hints = extractFilenameHints(fileName);
  const fromName = buildAnalysisFromFilenameHints(hints, fileName, docType);
  if (fromName) return fromName;

  const text = extractedText?.trim() || "";
  if (text.length > 0) {
    const heuristic = postValidateAnalysis(strictHeuristic(text, fileName, docType), text, fileName);
    if (heuristic.isRelevantForTenders) return heuristic;
  }

  if (hints.likelyMedicalRu || docType === "medical_ru") {
    return withProductDefaults({
      docType: "medical_ru",
      docTypeLabel: DOC_TYPE_LABELS.medical_ru,
      issuedTo: "",
      issuedBy: "Росздравнадзор",
      number: hints.rzNumber || hints.fsrNumber || "",
      validFrom: null,
      validUntil: null,
      summary: `Регистрационное удостоверение на медицинские изделия (${fileName.slice(0, 60)}).`,
      detectedContent: text.slice(0, 200) || fileName.slice(0, 120),
      isRelevantForTenders: true,
      warning:
        "Полный разбор приложения не выполнен — документ принят по названию. Нажмите «Перепроверить» на карточке для извлечения всех позиций из PDF.",
      confidence: 68,
      documentScope: "catalog",
      products: hints.productsFromName,
      productCount: hints.productsFromName.length,
    });
  }

  return strictHeuristic(text, fileName, docType);
}

async function analyzeDocumentQuick(
  filePath: string,
  fileName: string,
  docType: string,
  ext: string,
  mimeType: string,
  hints: FilenameHints,
  extractedText: string | null
): Promise<DocumentAnalysis> {
  if (["jpg", "jpeg", "png", "webp"].includes(ext) && process.env.GROQ_API_KEY) {
    const buffer = await readFile(filePath);
    const vision = await analyzeImageWithGroq(buffer, fileName, mimeType, docType);
    if (vision?.isRelevantForTenders) return vision;
  }

  const text = extractedText?.trim() || "";

  if (text.length > 0) {
    const gibberishReason = detectGibberishText(text);
    if (gibberishReason) return gibberishAnalysis(text, fileName, gibberishReason);

    if (isMedicalRuText(text) || hints.likelyMedicalRu || docType === "medical_ru") {
      if (text.length >= 120 && process.env.GROQ_API_KEY) {
        const groqResult = await analyzeTextWithGroq(text, fileName, docType);
        if (groqResult?.isRelevantForTenders) return groqResult;
      }
      const heuristic = applyMedicalRuOverrides(
        postValidateAnalysis(strictHeuristic(text, fileName, docType), text, fileName),
        text
      );
      if (heuristic.isRelevantForTenders) return heuristic;
    }

    if (text.length >= 400 && process.env.GROQ_API_KEY) {
      const groqResult = await analyzeTextWithGroq(text, fileName, docType);
      if (groqResult) return groqResult;
    }

    if (text.length >= 200) {
      return postValidateAnalysis(strictHeuristic(text, fileName, docType), text, fileName);
    }
  }

  const fromName = buildAnalysisFromFilenameHints(hints, fileName, docType);
  if (fromName) return fromName;

  return analyzeDocumentFallback(fileName, docType, text);
}

export async function analyzeDocument(
  fileUrl: string,
  fileName: string,
  docType: string,
  options: AnalyzeDocumentOptions = {}
): Promise<DocumentAnalysis> {
  const mode = options.mode ?? "full";
  const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isPdf = ext === "pdf";
  const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);
  const mimeType = isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const hints = extractFilenameHints(fileName);
  const extractedText = isPdf ? await extractTextFromPdf(filePath) : null;

  if (mode === "quick") {
    return analyzeDocumentQuick(filePath, fileName, docType, ext, mimeType, hints, extractedText);
  }

  if (isImage && process.env.GROQ_API_KEY) {
    const buffer = await readFile(filePath);
    const vision = await analyzeImageWithGroq(buffer, fileName, mimeType, docType);
    if (vision) return vision;
  }

  if (extractedText) {
    const gibberishReason = detectGibberishText(extractedText);
    if (gibberishReason) return gibberishAnalysis(extractedText, fileName, gibberishReason);
  }

  const hasMeaningfulText = extractedText && extractedText.length >= 400;
  const isScannedPdf = isPdf && (!extractedText || extractedText.length < 400);
  const visionMaxPages =
    hints.likelyMedicalRu || hints.likelyCertificate || docType === "medical_ru"
      ? PDF_VISION_MAX_PAGES_RU
      : PDF_VISION_MAX_PAGES;

  // Сканы и РУ — сначала Vision по всем страницам (текстовый слой часто пустой/битый)
  if (isPdf && process.env.GROQ_API_KEY && (isScannedPdf || hints.likelyMedicalRu || hints.likelyCertificate)) {
    const scanResult = await analyzePdfScanWithVision(filePath, fileName, docType, visionMaxPages);
    if (scanResult?.isRelevantForTenders) return scanResult;
    if (scanResult && scanResult.docType === "medical_ru") return scanResult;
  }

  if (hasMeaningfulText && process.env.GROQ_API_KEY) {
    const groqResult = await analyzeTextWithGroq(extractedText!, fileName, docType);
    if (groqResult) return groqResult;
    return postValidateAnalysis(strictHeuristic(extractedText!, fileName, docType), extractedText!, fileName);
  }

  if (isPdf && process.env.GROQ_API_KEY) {
    const scanResult = await analyzePdfScanWithVision(filePath, fileName, docType, visionMaxPages);
    if (scanResult) return scanResult;
  }

  if (extractedText && extractedText.length > 0 && process.env.GROQ_API_KEY) {
    const groqResult = await analyzeTextWithGroq(extractedText, fileName, docType);
    if (groqResult) return groqResult;
    return postValidateAnalysis(strictHeuristic(extractedText, fileName, docType), extractedText, fileName);
  }

  const fromFilename = buildAnalysisFromFilenameHints(hints, fileName, docType);
  if (fromFilename) return fromFilename;

  if (!extractedText && isPdf) {
    return {
      ...unreadablePdfAnalysis(fileName),
      warning: `Не удалось прочитать «${fileName}». Загрузите чёткий PDF или JPG/PNG каждой страницы. Для РУ и сертификатов нужны все страницы с приложением.`,
    };
  }

  if (!extractedText && process.env.GROQ_API_KEY) {
    const byName = await analyzeByFilenameWithGroq(fileName, docType, "изображение без распознавания");
    if (byName) return byName;
    return unreadablePdfAnalysis(fileName);
  }

  return strictHeuristic(extractedText || "", fileName, docType);
}

export interface TenderRequirements {
  licenses?: string[];
  minRevenue?: number;
  experience?: string;
  productSpecs?: string[];
  requiredDocs?: string[];
  technicalAssignment?: string;
  tenderDocuments?: Array<{ name: string; type: string; description: string }>;
  platform?: string;
  platformUrl?: string;
  procedureType?: string;
  law?: string;
}

/** AI сравнивает документы компании с ТЗ тендера */
export async function analyzeMatchWithGroq(
  tenderTitle: string,
  tenderDescription: string,
  requirements: TenderRequirements,
  docs: Array<{
    type: string;
    name: string;
    summary?: string;
    detectedContent?: string;
    isRelevant?: boolean;
    aiDocType?: string;
    ruNumber?: string;
    products?: string[];
    documentScope?: string;
    productCount?: number;
  }>,
  company: { okvedCodes: string[]; revenue: number | null; region: string | null; description: string | null }
): Promise<{
  score: number;
  strengths: string[];
  warnings: string[];
  blockers: string[];
  missingDocs: string[];
  specMatches: Array<{ spec: string; status: "match" | "partial" | "missing"; note: string }>;
  recommendation: string;
} | null> {
  if (!process.env.GROQ_API_KEY) return null;
  if (!isGroqTenderMatchEnabled()) return null;
  if (isGroqRateLimited()) return null;

  const relevantDocs = docs.filter((d) => d.isRelevant === true);
  if (docs.length > 0 && relevantDocs.length === 0) {
    return {
      score: 5,
      strengths: [],
      warnings: [],
      blockers: ["Нет ни одного подтверждённого корпоративного документа — все загруженные файлы отклонены AI."],
      missingDocs: requirements.requiredDocs || ["Выписка ЕГРЮЛ", "Бухгалтерский баланс"],
      specMatches: (requirements.productSpecs || []).map((s) => ({ spec: s, status: "missing" as const, note: "Нет документов для проверки" })),
      recommendation: "Сначала загрузите реальные документы компании: выписку ЕГРЮЛ, баланс, лицензии и сертификаты на продукцию.",
    };
  }

  const docsText = relevantDocs.map((d, i) => {
    const ruLine = d.ruNumber ? `\n   Номер РУ: ${d.ruNumber}` : "";
    const productsLine = d.products?.length
      ? `\n   Каталог изделий (${d.products.length}): ${d.products.slice(0, 15).join("; ")}${d.products.length > 15 ? "…" : ""}`
      : "";
    return `${i + 1}. [${d.aiDocType || d.type}] "${d.name}"${ruLine}
   Содержимое: ${d.detectedContent || d.summary || "не определено"}${productsLine}`;
  }).join("\n") || "Корпоративные документы не загружены";

  const tzText = [
    requirements.technicalAssignment ? `ТЕХНИЧЕСКОЕ ЗАДАНИЕ:\n${requirements.technicalAssignment.slice(0, 2000)}` : "",
    requirements.productSpecs?.length ? `ХАРАКТЕРИСТИКИ ТОВАРА/УСЛУГИ:\n${requirements.productSpecs.slice(0, 12).map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
    requirements.tenderDocuments?.length ? `ДОКУМЕНТЫ ЗАКУПКИ:\n${requirements.tenderDocuments.slice(0, 5).map((d) => `- ${d.name}`).join("\n")}` : "",
    requirements.licenses?.length ? `ЛИЦЕНЗИИ: ${requirements.licenses.join("; ")}` : "",
    requirements.minRevenue ? `МИН. ОБОРОТ: ${requirements.minRevenue.toLocaleString("ru-RU")} руб` : "",
    requirements.experience ? `ОПЫТ: ${requirements.experience}` : "",
    requirements.requiredDocs?.length ? `ДОКУМЕНТЫ ДЛЯ ЗАЯВКИ: ${requirements.requiredDocs.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  const raw = await callGroqJson(
    `Сравни готовность компании к участию в тендере по 44-ФЗ.

ТЕНДЕР: "${tenderTitle}"
${tenderDescription ? `Описание: ${tenderDescription.slice(0, 400)}` : ""}

${tzText || "Требования не детализированы"}

КОМПАНИЯ:
- ОКВЭД: ${company.okvedCodes.join(", ") || "не указан"}
- Регион: ${company.region || "не указан"}
- Оборот: ${company.revenue ? `${company.revenue.toLocaleString("ru-RU")} руб/год` : "не указан"}
- О деятельности: ${company.description?.slice(0, 200) || "не указано"}

ДОКУМЕНТЫ КОМПАНИИ (проверены AI; каждое РУ — отдельный документ на свою номенклатуру):
${docsText}

Задача: сравни характеристики из ТЗ с тем, что подтверждают документы компании.
Каждое РУ покрывает только свои изделия — не смешивай номенклатуру из разных РУ.
Не завышай score если документов нет или они не по теме тендера.

Верни JSON:
{
  "score": 0-100,
  "strengths": ["конкретные совпадения"],
  "warnings": ["что желательно доработать"],
  "blockers": ["критические препятствия"],
  "missingDocs": ["каких документов не хватает"],
  "specMatches": [{"spec": "требование из ТЗ", "status": "match|partial|missing", "note": "почему"}],
  "recommendation": "стоит ли участвовать и что сделать"
}`,
    {
      model: process.env.GROQ_MATCH_MODEL || "llama-3.1-8b-instant",
      maxTokens: 1200,
    }
  );

  if (!raw) return null;

  return {
    score: Math.max(5, Math.min(98, Number(raw.score) || 20)),
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
    blockers: Array.isArray(raw.blockers) ? raw.blockers.map(String) : [],
    missingDocs: Array.isArray(raw.missingDocs) ? raw.missingDocs.map(String) : [],
    specMatches: Array.isArray(raw.specMatches)
      ? raw.specMatches.map((s: { spec?: string; status?: string; note?: string }) => ({
          spec: String(s.spec || ""),
          status: (["match", "partial", "missing"].includes(String(s.status)) ? s.status : "missing") as "match" | "partial" | "missing",
          note: String(s.note || ""),
        }))
      : [],
    recommendation: String(raw.recommendation || ""),
  };
}

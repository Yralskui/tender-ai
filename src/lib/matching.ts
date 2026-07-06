import { isTradeSupplier } from "@/lib/docRecommendations";
import { isMedicalTender as isMedicalTenderVertical } from "@/lib/productVertical";
import {
  isNonMedicalConsumerTextileTender,
  isServiceProcurement,
  isWorksProcurement,
  isCharacteristicFieldName,
  isGenericConsumablesAccessoryLine,
  titleConflictsWithTzProducts,
} from "@/lib/tzSanitizer";
import {
  WEAK_MATCH_WORDS,
  catalogFamiliesFromProducts,
  describeCatalogFamilies,
  describeTenderFamilies,
  detectProductFamilies,
  detectTextileSubTypes,
  familiesAreCompatible,
  familiesForMatchLine,
  isMedicalLinenSetLine,
  isSurgicalSuitLine,
  isTechnicalSpec,
  isLabIvdLine,
  isMedicalConnectorLine,
  isSurgicalCapLine,
  isSterilizationContainerLine,
  isSterileFilmLine,
  isTextileProduct,
  normalizeMatchText,
  sterilityPreferencesConflict,
  parseSterilityPreference,
  textileSubTypesCompatible,
  type ProductFamily,
  type TextileSubType,
} from "@/lib/productFamilies";
import {
  compareProductDimensions,
  parseTzDimensions,
  type StructuredCatalogItem,
} from "@/lib/productDimensions";
import { normalizeTzSpecText } from "@/lib/textNormalize";

/**
 * Реальная логика матчинга компании с тендером.
 * Сравниваем загруженные документы, ОКВЭД, оборот и регион с требованиями тендера.
 * Нерелевантные документы (флаг isRelevant=false от AI) не учитываются.
 */

export const DOC_TYPE_TO_LICENSE: Record<string, string[]> = {
  license_fsb: ["ФСБ", "fsb", "защита информации", "шифрование"],
  license_fstec: ["ФСТЭК", "fstec", "техническая защита"],
  license_sro: ["СРО", "sro", "строительство", "проектирование"],
  license_mchs: ["МЧС", "пожарная", "mchs"],
  certificate: ["сертификат", "certificate", "гост", "gost", "декларация соответствия"],
  medical_ru: ["росздравнадзор", "регистрационное удостоверение", "медицинск", "медиздел", "фср", "ру на"],
  balance: ["баланс", "оборот", "финансовая"],
  egrul: ["ЕГРЮЛ", "реестр юридических"],
  contracts: ["контрактов ЕИС", "опыт контрактов", "реестр контрактов"],
};

export interface UploadedDoc {
  type: string;
  name: string;
  /** false = AI определил документ как нерелевантный (личный, спортивный и т.д.) */
  isRelevant?: boolean;
  /** Тип документа определённый AI (может отличаться от выбранного пользователем) */
  aiDocType?: string;
  /** Краткое описание из AI анализа */
  summary?: string;
  detectedContent?: string;
  /** Номер РУ (ФСР / РЗН) */
  ruNumber?: string;
  /** Перечень изделий из РУ / каталога */
  products?: string[];
  /** Структура каталога с размерами в мм */
  catalogItems?: StructuredCatalogItem[];
  productCount?: number;
  documentScope?: string;
}

interface TenderRequirements {
  licenses?: string[];
  minRevenue?: number;
  experience?: string;
  productSpecs?: string[];
  tzProducts?: string[];
  requiredDocs?: string[];
  platform?: string;
  platformUrl?: string;
  procedureType?: string;
  law?: string;
  securityDeposit?: number;
  contractSecurity?: number;
}

interface CompanyProfile {
  okvedCodes: string[];
  revenue: number | null;
  region: string | null;
  description: string | null;
}

interface AnalysisResult {
  score: number;
  strengths: string[];
  warnings: string[];
  blockers: string[];
  missingDocs: string[];
  recommendation: string;
  irrelevantDocsCount: number;
  specMatches: SpecMatch[];
  /** Позиции только из РУ, релевантных этому тендеру */
  catalogProducts: string[];
  /** Какие РУ учтены в сверке */
  catalogRuSources: CatalogRuSource[];
  /** Сколько загруженных РУ не подошли к номенклатуре тендера */
  excludedRuCount: number;
  /** РУ и предмет закупки — разные виды изделий */
  nomenclatureMismatch: boolean;
}

export interface CatalogRuSource {
  number: string;
  name: string;
  productCount: number;
}

function hasLicenseMatch(docType: string, licenseText: string): boolean {
  const keywords = DOC_TYPE_TO_LICENSE[docType] || [];
  const lower = licenseText.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export interface SpecMatch {
  spec: string;
  status: "match" | "partial" | "missing";
  note: string;
}

function normalizeForMatch(s: string): string {
  return normalizeMatchText(s);
}

/** Убираем шум из выписок ЕРУЛ («наименование медицинского изделия: …») */
function normalizeCatalogProductLabel(product: string): string {
  return product
    .replace(/^наименование\s+медицинского\s+изделия:\s*/i, "")
    .replace(/^медицинское\s+изделие:\s*/i, "")
    .trim();
}

function isUltrasoundProbeCoverLine(text: string): boolean {
  const n = normalizeMatchText(text);
  if (!/чехол/i.test(n)) return false;
  return /датчик|узи|ультразвук|инвазивн|визуализ|трансдьюс/i.test(n);
}

function isMedicalGownLine(text: string): boolean {
  const n = normalizeMatchText(text);
  return /халат/i.test(n) || /сорочк/i.test(n);
}

function isAntisepticWipeLine(text: string): boolean {
  const n = normalizeMatchText(text);
  return /салфет/i.test(n) && /антисепт|спирт|пропит/i.test(n);
}

function isDryMedicalWipeMatch(product: string): boolean {
  const n = normalizeMatchText(product);
  return /салфет/i.test(n) && !/антисепт|спирт/i.test(n);
}

function isStrongGownMatch(spec: string, product: string): boolean {
  const s = normalizeMatchText(normalizeCatalogProductLabel(spec));
  const p = normalizeMatchText(normalizeCatalogProductLabel(product));
  if (!/халат/i.test(s) || !/халат/i.test(p)) return false;
  if (/процедурн/i.test(s) && /процедурн/i.test(p)) return true;
  if (/хирургическ/i.test(s) && /хирургическ/i.test(p)) return true;
  return s.length >= 14 && p.length >= 14;
}

function isStrongCapMatch(spec: string, product: string): boolean {
  const s = normalizeMatchText(normalizeCatalogProductLabel(spec));
  const p = normalizeMatchText(normalizeCatalogProductLabel(product));
  if (!isSurgicalCapLine(spec) && !/шапоч|берет|колпак|шарлот/i.test(s)) return false;
  return isSurgicalCapLine(product) || /шапоч|берет|шарлот|колпак/i.test(p);
}

function catalogMatchPriority(product: string): number {
  const p = product.toLowerCase();
  if (/сертиф|соответств/i.test(p)) return 1;
  if (/шапоч|берет|рзн|фср|шарлот/i.test(p)) return 3;
  return 2;
}

/** Строки номенклатуры — без характеристик и служебных полей КТРУ */
function primaryNomenclatureLines(searchLines: string[]): string[] {
  return searchLines.filter((line) => {
    const t = line.trim();
    if (t.length < 8) return false;
    if (isCharacteristicFieldName(t)) return false;
    if (/^позиция\s*тз\s*№/i.test(t)) return false;
    if (/^ктру:/i.test(t)) return false;
    if (/^объём\s+закупки/i.test(t)) return false;
    const colon = t.indexOf(":");
    if (colon > 0 && colon < 70 && isCharacteristicFieldName(t.slice(0, colon))) return false;
    return true;
  });
}

const MATCH_STOP_WORDS = new Set([
  "для", "или", "при", "без", "под", "над", "из", "по", "на", "от", "до",
  "комплект", "медицинский", "медицинское", "медицинские", "медицинских",
  "изделие", "изделия", "изделий", "поставка", "закупка", "набор", "наборы",
  "стерильный", "стерильные", "стерильных", "одноразовый", "одноразовые",
  "комплект", "комплектом", "комплекта", "комплекте", "комплекту",
  "медицинского", "медицинских", "лекарственного", "лекарственный", "препарата", "препарат",
  "расходный", "материал", "материалы", "оборудование", "средство", "средства",
]);

function significantWords(s: string): string[] {
  return normalizeForMatch(s)
    .split(" ")
    .filter(
      (w) =>
        w.length > 4 &&
        !MATCH_STOP_WORDS.has(w) &&
        !WEAK_MATCH_WORDS.has(w) &&
        !/^комплект/i.test(w)
    );
}

function isKitAccessoryWord(w: string): boolean {
  return /^комплект/i.test(w);
}

function tenderContextFamilies(searchLines: string[]): Set<ProductFamily> {
  const blob = searchLines.join(" ");
  const families = detectProductFamilies(blob);
  if (isUltrasoundProbeCoverLine(blob)) {
    families.delete("medical_electronic");
  }
  return families;
}

function catalogDocFamilies(doc: UploadedDoc): Set<ProductFamily> {
  const fromProducts = catalogFamiliesFromProducts(doc.products || []);
  if (fromProducts.size > 1 || ![...fromProducts].every((f) => f === "unknown")) {
    return fromProducts;
  }
  return detectProductFamilies([doc.summary, doc.detectedContent, doc.name].filter(Boolean).join(" "));
}

function wordsOverlap(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (isKitAccessoryWord(a) || isKitAccessoryWord(b)) return false;
  if (/^медицин/i.test(a) && /^медицин/i.test(b)) return false;
  if (/^однораз/i.test(a) && /^однораз/i.test(b)) return false;
  if (/^хирург/i.test(a) && /^хирург/i.test(b)) return false;
  if (/^процедур/i.test(a) && /^процедур/i.test(b)) return false;
  if (/^стерил/i.test(a) && /^стерил/i.test(b) && a !== b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  if (a.length >= 7 && b.length >= 7 && a.slice(0, 6) === b.slice(0, 6)) return true;
  return false;
}

function textileTypesCompatible(spec: string, product: string): boolean {
  const specFamilies = familiesForMatchLine(spec);
  const productFamilies = familiesForMatchLine(product);
  const specTextile = specFamilies.has("medical_textile") || isTextileProduct(spec);
  const productTextile = productFamilies.has("medical_textile") || isTextileProduct(product);
  if (!specTextile && !productTextile) return true;
  if (textileKindAnchorMatch(spec, product)) return true;
  if (specTextile && productTextile) {
    return textileSubTypesCompatible(detectTextileSubTypes(spec), detectTextileSubTypes(product));
  }
  return false;
}

function tenderNomenclatureLines(
  title?: string,
  category?: string,
  tzProducts?: string[],
  productSpecs?: string[]
): string[] {
  const lines = new Set<string>();
  if (title?.trim()) lines.add(title.trim());
  if (category?.trim()) lines.add(category.trim());
  for (const name of tzProducts || []) {
    const trimmed = name?.trim();
    if (trimmed && trimmed.length >= 6 && !isCharacteristicFieldName(trimmed)) {
      lines.add(trimmed);
    }
  }
  for (const spec of productSpecs || []) {
    if (/^Позиция\s*ТЗ\s*:/i.test(spec)) {
      const name = spec.replace(/^Позиция\s*ТЗ\s*:\s*/i, "").trim();
      if (name && name.length >= 6 && !isCharacteristicFieldName(name)) {
        lines.add(name);
      }
    }
  }
  return [...lines];
}

function tenderSearchLines(
  title?: string,
  category?: string,
  productSpecs?: string[],
  tzProducts?: string[]
): string[] {
  const lines = new Set<string>();
  if (title?.trim()) lines.add(title.trim());
  if (category?.trim()) lines.add(category.trim());
  for (const name of tzProducts || []) {
    if (name?.trim()) lines.add(name.trim());
  }
  for (const spec of productSpecs || []) {
    if (spec?.trim()) lines.add(spec.trim());
  }
  return [...lines];
}

function textileKindAnchorMatch(spec: string, product: string): boolean {
  if (isMedicalConnectorLine(spec) || isMedicalConnectorLine(product)) return false;
  if (isSurgicalCapLine(spec) !== isSurgicalCapLine(product)) return false;

  const specTypes = detectTextileSubTypes(spec);
  const productTypes = detectTextileSubTypes(product);
  const specific = (s: Set<TextileSubType>) => [...s].filter((t) => t !== "generic_textile");
  const ts = specific(specTypes);
  const ps = specific(productTypes);
  if (ts.length === 0 || ps.length === 0) return false;
  return textileSubTypesCompatible(specTypes, productTypes) && ts.some((t) => ps.includes(t));
}

type EffectiveDoc = UploadedDoc & { effectiveType: string };

function isCatalogDoc(doc: EffectiveDoc): boolean {
  return doc.effectiveType === "medical_ru" || doc.documentScope === "catalog";
}

function ruDocRelevanceScore(doc: UploadedDoc, searchLines: string[]): number {
  const products = doc.products || [];
  if (products.length === 0 && !doc.summary && !doc.detectedContent) return 0;

  const primaryLines = primaryNomenclatureLines(searchLines);
  const lines = primaryLines.length > 0 ? primaryLines : searchLines.slice(0, 8);

  const tenderFamilies = tenderContextFamilies(lines);
  const docFamilies = catalogDocFamilies(doc);
  if (!familiesAreCompatible(tenderFamilies, docFamilies)) return 0;

  let score = 0;
  const blob = normalizeForMatch(
    [doc.summary, doc.detectedContent, doc.name, doc.ruNumber, ...products].filter(Boolean).join(" ")
  );

  for (const line of lines.slice(0, 6)) {
    if (line.length < 8) continue;
    const m = specMatchesCatalog(line, products);
    if (m.matched) score += 14;
    else if (m.partial) score += 6;

    const lineWords = significantWords(line);
    const hits = lineWords.filter((w) => blob.split(" ").some((bw) => wordsOverlap(w, bw) || blob.includes(w)));
    if (hits.length >= 2) score += 4;

    for (const product of products) {
      if (isStrongGownMatch(line, product)) {
        score += 16;
        break;
      }
    }
  }

  return score;
}

function selectRelevantCatalogDocs(
  catalogDocs: EffectiveDoc[],
  searchLines: string[]
): EffectiveDoc[] {
  if (catalogDocs.length === 0) return [];
  if (searchLines.length === 0) return [];

  const tenderFamilies = tenderContextFamilies(searchLines);
  const primaryLines = primaryNomenclatureLines(searchLines);

  const pick = (lines: string[], minScore: number) =>
    catalogDocs
      .map((doc) => ({ doc, score: ruDocRelevanceScore(doc, lines) }))
      .filter((item) => {
        if (item.score < minScore) return false;
        return familiesAreCompatible(tenderFamilies, catalogDocFamilies(item.doc));
      })
      .map((item) => item.doc);

  let selected = pick(searchLines, 4);
  if (selected.length === 0 && primaryLines.length > 0) {
    selected = pick(primaryLines, 4);
  }
  if (selected.length === 0 && primaryLines.length > 0) {
    selected = catalogDocs.filter((doc) => {
      if (!familiesAreCompatible(tenderFamilies, catalogDocFamilies(doc))) return false;
      return primaryLines.some((line) => {
        const m = matchProductToCatalog(line, doc.products || []);
        return m.status !== "missing";
      });
    });
  }

  return selected;
}

/** Документы для AI-анализа: корпоративные + только РУ, подходящие к номенклатуре тендера */
export function filterDocsForTenderMatch(
  docs: UploadedDoc[],
  requirements: TenderRequirements,
  tenderMeta?: { category?: string; title?: string }
): UploadedDoc[] {
  const relevantDocs = docs.filter((d) => d.isRelevant === true);
  const effectiveDocs: EffectiveDoc[] = relevantDocs.map((d) => ({
    ...d,
    effectiveType: d.aiDocType && d.aiDocType !== "другое" ? d.aiDocType : d.type,
  }));

  const catalogDocs = effectiveDocs.filter(isCatalogDoc);
  const otherDocs = effectiveDocs.filter((d) => !isCatalogDoc(d));
  const searchLines = tenderNomenclatureLines(
    tenderMeta?.title,
    tenderMeta?.category,
    requirements.tzProducts,
    requirements.productSpecs
  );
  const selectedCatalog = selectRelevantCatalogDocs(catalogDocs, searchLines);

  return [...otherDocs, ...selectedCatalog];
}

export function mapCompanyDocuments(
  documents: Array<{ type: string; name: string; extractedData?: string | null }>
): UploadedDoc[] {
  return documents.map((d) => {
    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse((d.extractedData as string) || "{}");
    } catch {
      extracted = {};
    }
    return {
      type: d.type,
      name: d.name,
      isRelevant: extracted.isRelevant === true,
      aiDocType: typeof extracted.docType === "string" ? extracted.docType : undefined,
      summary: typeof extracted.summary === "string" ? extracted.summary : undefined,
      detectedContent: typeof extracted.detectedContent === "string" ? extracted.detectedContent : undefined,
      ruNumber: typeof extracted.number === "string" ? extracted.number : undefined,
      products: Array.isArray(extracted.products) ? extracted.products.map(String) : undefined,
      catalogItems: Array.isArray(extracted.catalogItems)
        ? (extracted.catalogItems as StructuredCatalogItem[])
        : undefined,
      productCount: typeof extracted.productCount === "number" ? extracted.productCount : undefined,
      documentScope: typeof extracted.documentScope === "string" ? extracted.documentScope : undefined,
    };
  });
}

function formatMatchProductLabel(product: string, maxLen = 100): string {
  if (product.length <= maxLen) return product;
  const dims = product.match(/(?:длина|ширина|высота)\s+[\d\-–]+(?:\s*,\s*(?:длина|ширина|высота)\s+[\d\-–]+)*/gi);
  const suffix = dims ? `, ${dims.join(", ")}` : "";
  const headBudget = Math.max(24, maxLen - suffix.length);
  return `${product.slice(0, headBudget).trim()}…${suffix}`;
}

function findCatalogItem(
  product: string,
  structured: StructuredCatalogItem[] | undefined
): StructuredCatalogItem | undefined {
  if (!structured?.length) return undefined;
  const lower = product.toLowerCase();
  return structured.find(
    (i) =>
      i.displayText.toLowerCase() === lower ||
      i.rawText.toLowerCase() === lower ||
      i.name.toLowerCase() === lower ||
      lower.includes(i.name.toLowerCase())
  );
}

function applyDimensionCheck(
  spec: string,
  product: string,
  structured: StructuredCatalogItem[] | undefined,
  base: { matched: boolean; partial: boolean; note: string; matchedProduct: string | null }
): { matched: boolean; partial: boolean; note: string; matchedProduct: string | null } {
  const tzDims = parseTzDimensions(spec);
  if (!tzDims) return base;

  const item = findCatalogItem(product, structured);
  if (!item || Object.keys(item.dimensions).length === 0) {
    if (base.matched) {
      return {
        ...base,
        partial: true,
        note: `${base.note}. В ТЗ указаны размеры — проверьте вручную по приложению РУ`,
      };
    }
    return base;
  }

  const dimResult = compareProductDimensions(tzDims, item.dimensions);
  if (dimResult.ok) {
    return {
      matched: true,
      partial: false,
      matchedProduct: item.displayText,
      note: dimResult.note || `Совпадение: ${item.displayText}`,
    };
  }
  if (dimResult.partial) {
    return {
      matched: false,
      partial: true,
      matchedProduct: item.displayText,
      note: dimResult.note,
    };
  }
  return {
    matched: false,
    partial: false,
    matchedProduct: null,
    note: dimResult.note || "Размеры ТЗ не входят в диапазон РУ",
  };
}

function specMatchesCatalog(
  spec: string,
  products: string[],
  structured?: StructuredCatalogItem[]
): { matched: boolean; partial: boolean; note: string; matchedProduct: string | null } {
  if (isServiceProcurement(spec) || isWorksProcurement(spec)) {
    return {
      matched: false,
      partial: false,
      note: "Закупка услуг или работ — не поставка изделий из РУ",
      matchedProduct: null,
    };
  }

  if (isGenericConsumablesAccessoryLine(spec)) {
    return {
      matched: false,
      partial: false,
      note: "Слишком общая формулировка — это не конкретное изделие из РУ",
      matchedProduct: null,
    };
  }

  if (isMedicalConnectorLine(spec)) {
    const deviceCandidates = products.filter(
      (p) => !isTextileProduct(p) && !isSurgicalCapLine(p)
    );
    if (deviceCandidates.length === 0) {
      return {
        matched: false,
        partial: false,
        note: "Коннектор/фитинг — в РУ только текстиль (шапочки, халаты и т.п.)",
        matchedProduct: null,
      };
    }
  }

  let candidates = products;

  if (isLabIvdLine(spec)) {
    const labCandidates = products.filter((p) => isLabIvdLine(p) || !isTextileProduct(p));
    if (labCandidates.length === 0) {
      return {
        matched: false,
        partial: false,
        note: "Лабораторная/ПЦР номенклатура — в РУ только текстиль и бельё",
        matchedProduct: null,
      };
    }
    candidates = labCandidates;
  }

  if (isMedicalConnectorLine(spec)) {
    candidates = candidates.filter((p) => !isTextileProduct(p) && !isSurgicalCapLine(p));
  }

  if (isUltrasoundProbeCoverLine(spec)) {
    const coverPool = products.filter(
      (p) => isUltrasoundProbeCoverLine(p) || (/чехол/i.test(normalizeMatchText(p)) && !isMedicalGownLine(p))
    );
    if (coverPool.length === 0) {
      return {
        matched: false,
        partial: false,
        note: "Чехол для датчика УЗИ — в РУ нет чехлов, только другой текстиль",
        matchedProduct: null,
      };
    }
    candidates = coverPool;
  }

  if (isSterilizationContainerLine(spec)) {
    const containerPool = products.filter(
      (p) => isSterilizationContainerLine(p) || /контейнер/i.test(normalizeMatchText(p))
    );
    if (containerPool.length === 0) {
      return {
        matched: false,
        partial: false,
        note: "Контейнер для стерилизации — в РУ нет контейнеров, только другая номенклатура",
        matchedProduct: null,
      };
    }
    candidates = containerPool;
  }

  if (isAntisepticWipeLine(spec)) {
    const wipePool = products.filter((p) => /салфет/i.test(normalizeMatchText(p)));
    if (wipePool.length === 0) {
      return {
        matched: false,
        partial: false,
        note: "Антисептические салфетки — в каталоге РУ нет салфеток (нужно приложение к РУ)",
        matchedProduct: null,
      };
    }
    const dryWipe = wipePool.find((p) => isDryMedicalWipeMatch(p));
    if (dryWipe) {
      return {
        matched: false,
        partial: true,
        note: "В РУ есть салфетки без антисептика — для антисептических нужно другое РУ",
        matchedProduct: dryWipe,
      };
    }
    candidates = wipePool;
  }

  const specFamilies = familiesForMatchLine(spec);

  if (isTechnicalSpec(spec)) {
    const textileContext =
      specFamilies.has("medical_textile") ||
      /халат|бель|неткан|спанбонд|спунбонд|бахил|маск|салфет|плотност/i.test(spec.toLowerCase());
    if (!textileContext) {
      candidates = products.filter((p) => !isTextileProduct(p));
      if (candidates.length === 0) {
        return {
          matched: false,
          partial: false,
          note: "Техпараметр ТЗ не относится к текстилю/белью из вашего РУ",
          matchedProduct: null,
        };
      }
    }
  }

  const specWords = significantWords(spec);
  if (specWords.length === 0) {
    return { matched: false, partial: false, note: "Нет однозначных ключевых слов для сверки", matchedProduct: null };
  }

  const specKnown = [...specFamilies].filter((f) => f !== "unknown");
  const specLower = normalizeForMatch(spec);

  let bestPartial: { hits: number; product: string } | null = null;

  if (isSurgicalCapLine(spec) || /шапоч|берет/i.test(specLower)) {
    candidates = [...candidates].sort((a, b) => catalogMatchPriority(b) - catalogMatchPriority(a));
  }

  for (const product of candidates) {
    const productFamilies = familiesForMatchLine(product);
    if (!familiesAreCompatible(specFamilies, productFamilies)) continue;
    if (sterilityPreferencesConflict(spec, product)) continue;
    if (isMedicalLinenSetLine(spec) && isMedicalGownLine(product) && !isMedicalLinenSetLine(product)) {
      continue;
    }
    if (isMedicalGownLine(spec) && isMedicalLinenSetLine(product) && !isMedicalGownLine(product)) {
      continue;
    }
    if (
      specKnown.length > 0 &&
      productFamilies.size === 1 &&
      productFamilies.has("unknown") === false &&
      !specKnown.some((f) => productFamilies.has(f))
    ) {
      continue;
    }
    if (!textileTypesCompatible(spec, product)) continue;

    if (
      isMedicalConnectorLine(spec) &&
      (isSurgicalCapLine(product) || (isTextileProduct(product) && !isMedicalConnectorLine(product)))
    ) {
      continue;
    }
    if (isSurgicalCapLine(spec) && isMedicalConnectorLine(product)) continue;

    if (isUltrasoundProbeCoverLine(spec) && isMedicalGownLine(product)) continue;
    if (isMedicalGownLine(spec) && isUltrasoundProbeCoverLine(product)) continue;
    if (isSterilizationContainerLine(spec) && isSterileFilmLine(product)) continue;
    if (isSterileFilmLine(spec) && isSterilizationContainerLine(product)) continue;

    if (isStrongGownMatch(spec, product) && !isMedicalLinenSetLine(spec)) {
      return applyDimensionCheck(spec, product, structured, {
        matched: true,
        partial: false,
        note: `Совпадение с «${formatMatchProductLabel(normalizeCatalogProductLabel(product))}»`,
        matchedProduct: product,
      });
    }

    if (isStrongCapMatch(spec, product)) {
      return applyDimensionCheck(spec, product, structured, {
        matched: true,
        partial: false,
        note: `Совпадение с «${formatMatchProductLabel(normalizeCatalogProductLabel(product))}»`,
        matchedProduct: product,
      });
    }

    if (textileKindAnchorMatch(spec, product)) {
      return applyDimensionCheck(spec, product, structured, {
        matched: true,
        partial: false,
        note: `Совпадение с «${formatMatchProductLabel(product)}»`,
        matchedProduct: product,
      });
    }

    const productLower = normalizeForMatch(normalizeCatalogProductLabel(product));
    if (
      /игл\w*/i.test(specLower) &&
      !/игл\w*/i.test(productLower) &&
      (isTextileProduct(product) || productFamilies.has("medical_textile"))
    ) {
      continue;
    }
    if (
      /шприц\w*/i.test(specLower) &&
      !/шприц\w*/i.test(productLower) &&
      (isTextileProduct(product) || productFamilies.has("medical_textile"))
    ) {
      continue;
    }

    const productWords = productLower.split(" ").filter((w) => w.length > 4);
    const hits = specWords.filter(
      (w) => productLower.includes(w) || productWords.some((pw) => wordsOverlap(w, pw))
    );

    const minHits = Math.min(2, specWords.length);
    if (hits.length >= minHits && hits.length >= 2) {
      const distinctHits = [...new Set(hits)];
      if (distinctHits.length >= 2) {
        return applyDimensionCheck(spec, product, structured, {
          matched: true,
          partial: false,
          note: `Совпадение с «${formatMatchProductLabel(product)}»`,
          matchedProduct: product,
        });
      }
    }

    if (
      hits.length === 1 &&
      specWords.length === 1 &&
      specWords[0].length >= 6 &&
      productLower.includes(specWords[0])
    ) {
      return applyDimensionCheck(spec, product, structured, {
        matched: true,
        partial: false,
        note: `Совпадение с «${formatMatchProductLabel(product)}»`,
        matchedProduct: product,
      });
    }

    if (hits.length === 1 && !isTechnicalSpec(spec)) {
      if (!bestPartial || hits.length > bestPartial.hits) {
        bestPartial = { hits: hits.length, product };
      }
    }
  }

  if (bestPartial && !isTechnicalSpec(spec)) {
    const partialFamilies = familiesForMatchLine(bestPartial.product);
    if (!familiesAreCompatible(specFamilies, partialFamilies)) {
      return { matched: false, partial: false, note: "Другой вид изделий — не ваше РУ", matchedProduct: null };
    }
    if (isSterilizationContainerLine(spec) && isSterileFilmLine(bestPartial.product)) {
      return {
        matched: false,
        partial: false,
        note: "Контейнер для стерилизации — в РУ нет контейнеров, только другая номенклатура",
        matchedProduct: null,
      };
    }
    if (!textileTypesCompatible(spec, bestPartial.product)) {
      return {
        matched: false,
        partial: false,
        note: "Другой вид текстиля — в РУ нет такого изделия (например маска ≠ халат)",
        matchedProduct: null,
      };
    }
    if (sterilityPreferencesConflict(spec, bestPartial.product)) {
      return {
        matched: false,
        partial: false,
        note: "Стерильность в ТЗ и РУ не совпадает (стерильное ≠ нестерильное)",
        matchedProduct: null,
      };
    }
    if (
      isMedicalLinenSetLine(spec) &&
      isMedicalGownLine(bestPartial.product) &&
      !isMedicalLinenSetLine(bestPartial.product)
    ) {
      return {
        matched: false,
        partial: false,
        note: "Набор белья (костюм) — в РУ только халат, не комплект белья",
        matchedProduct: null,
      };
    }
    return applyDimensionCheck(spec, bestPartial.product, structured, {
      matched: false,
      partial: true,
      note: `Возможное совпадение с «${formatMatchProductLabel(bestPartial.product)}» — проверьте вручную`,
      matchedProduct: bestPartial.product,
    });
  }

  return { matched: false, partial: false, note: "Нет в каталоге РУ", matchedProduct: null };
}

function finalizeCatalogMatch(
  spec: string,
  result: { matched: boolean; partial: boolean; note: string; matchedProduct: string | null }
): { matched: boolean; partial: boolean; note: string; matchedProduct: string | null } {
  if (!result.matchedProduct) return result;
  if (sterilityPreferencesConflict(spec, result.matchedProduct)) {
    return {
      matched: false,
      partial: false,
      note: "Стерильность в ТЗ и РУ не совпадает (стерильное ≠ нестерильное)",
      matchedProduct: null,
    };
  }
  const specS = parseSterilityPreference(spec);
  const prodS = parseSterilityPreference(result.matchedProduct);
  if (result.matched && specS !== "unknown" && prodS === "unknown") {
    return {
      matched: false,
      partial: true,
      matchedProduct: result.matchedProduct,
      note:
        specS === "non_sterile"
          ? "ТЗ требует нестерильное изделие — проверьте стерильность в приложении к РУ"
          : "ТЗ требует стерильное изделие — проверьте стерильность в приложении к РУ",
    };
  }
  return result;
}

export function matchProductToCatalog(
  requestedName: string,
  catalogProducts: string[],
  structured?: StructuredCatalogItem[]
): { status: "match" | "partial" | "missing"; matchedProduct: string | null; note: string } {
  const m = finalizeCatalogMatch(requestedName, specMatchesCatalog(requestedName, catalogProducts, structured));
  if (m.matched) return { status: "match", matchedProduct: m.matchedProduct, note: m.note };
  if (m.partial) return { status: "partial", matchedProduct: m.matchedProduct, note: m.note };
  return { status: "missing", matchedProduct: null, note: m.note };
}

/** Характеристика описывает другое изделие, чем родительская позиция ТЗ */
function isCrossDeviceCharacteristic(field: string, parentProduct: string): boolean {
  const f = field.toLowerCase();
  const p = parentProduct.toLowerCase();
  if (/катетер/i.test(f) && /коннектор/i.test(p) && !/катетер/i.test(p)) return true;
  if (/коннектор/i.test(f) && /катетер/i.test(p) && !/коннектор/i.test(p)) return true;
  if ((/аспирац|ирригац/i.test(f) || /отверст/i.test(f)) && /коннектор/i.test(p) && !/катетер/i.test(p)) {
    return true;
  }
  if (/шапоч|берет/i.test(f) && /коннектор|катетер|luer|люер/i.test(p)) return true;
  if (/коннектор|катетер/i.test(f) && /шапоч|берет/i.test(p) && !/коннектор|катетер/i.test(p)) return true;
  return false;
}

/** Сверка одной характеристики ТЗ с позицией из РУ (не поиск изделия по названию поля). */
export function matchTzCharacteristic(
  field: string,
  value: string,
  parentProduct: string,
  catalogProducts: string[],
  structured?: StructuredCatalogItem[]
): { status: "match" | "partial" | "missing"; matchedProduct: string | null; note: string } {
  const fullSpec = `${field}: ${value}`;
  const valueNorm = value.toLowerCase().trim();
  const fieldNorm = normalizeMatchText(field);
  const parentNorm = normalizeMatchText(parentProduct);

  if (isCrossDeviceCharacteristic(field, parentProduct)) {
    return {
      status: "missing",
      matchedProduct: null,
      note: "Параметр относится к другому изделию в закупке",
    };
  }

  if (/состав\s+костюма|рубашк.*брюк/i.test(field.toLowerCase()) && isMedicalGownLine(parentProduct)) {
    return {
      status: "missing",
      matchedProduct: null,
      note: "ТЗ требует костюм (рубашка + брюки), а не халат",
    };
  }

  const parentMatch = matchProductToCatalog(parentProduct, catalogProducts, structured);
  const targetProduct = parentMatch.matchedProduct;

  if (/^(соответствие|наличие)$/i.test(valueNorm)) {
    const isDuplicateProductLine =
      fieldNorm === parentNorm ||
      (fieldNorm.length > 20 && parentNorm.includes(fieldNorm)) ||
      (parentNorm.length > 20 && fieldNorm.includes(parentNorm));
    if (isDuplicateProductLine) {
      if (parentMatch.status === "match") {
        return {
          status: "match",
          matchedProduct: parentMatch.matchedProduct,
          note: "Позиция подтверждена по РУ",
        };
      }
      return {
        status: parentMatch.status,
        matchedProduct: parentMatch.matchedProduct,
        note: parentMatch.note,
      };
    }
  }

  if (!targetProduct) {
    if (parentMatch.status === "partial") {
      return {
        status: "partial",
        matchedProduct: parentMatch.matchedProduct,
        note: "Изделие в РУ найдено частично — проверьте параметр вручную",
      };
    }
    return { status: "missing", matchedProduct: null, note: "Нет подходящего изделия в РУ для этой позиции" };
  }

  const item = findCatalogItem(targetProduct, structured);
  const catalogText = (item?.rawText || targetProduct).toLowerCase();
  const fieldLower = field.toLowerCase();
  const valueLower = value.toLowerCase();

  if (parseTzDimensions(fullSpec)) {
    const dimResult = applyDimensionCheck(fullSpec, targetProduct, structured, {
      matched: true,
      partial: false,
      note: "",
      matchedProduct: targetProduct,
    });
    if (dimResult.matched) {
      return { status: "match", matchedProduct: dimResult.matchedProduct, note: dimResult.note || "Размеры совпадают с РУ" };
    }
    if (dimResult.partial) {
      return { status: "partial", matchedProduct: dimResult.matchedProduct, note: dimResult.note };
    }
    if (dimResult.note.includes("не входят") || dimResult.note.includes("ТЗ")) {
      return { status: "missing", matchedProduct: dimResult.matchedProduct, note: dimResult.note };
    }
  }

  if (/стерильн/i.test(fieldLower) || /стерильн/i.test(valueLower) || /стерильн/i.test(parentNorm)) {
    if (sterilityPreferencesConflict(`${parentProduct} ${field} ${value}`, targetProduct)) {
      return {
        status: "missing",
        matchedProduct: targetProduct,
        note: "Стерильность в РУ не совпадает с ТЗ (стерильное ≠ нестерильное)",
      };
    }
    if (/стерильн/i.test(catalogText) || /стерильн/i.test(targetProduct.toLowerCase())) {
      return { status: "match", matchedProduct: targetProduct, note: "Стерильность подтверждается РУ" };
    }
    return { status: "partial", matchedProduct: targetProduct, note: "Проверьте стерильность в приложении к РУ" };
  }

  if (/материал|неткан|спанбонд|спунбонд|мельтблаун/i.test(fieldLower)) {
    const keywords = ["неткан", "спанбонд", "спунбонд", "мельтблаун", "смс", "полипропилен"];
    const hit = keywords.find((k) => valueLower.includes(k) && (catalogText.includes(k) || targetProduct.toLowerCase().includes(k)));
    if (hit) {
      return { status: "match", matchedProduct: targetProduct, note: `Материал совпадает: ${hit}` };
    }
  }

  if (/^тип$/i.test(fieldNorm.trim()) && /берет|колпак|шарлот/i.test(valueLower)) {
    if (isSurgicalCapLine(parentProduct) || /шапоч|берет|колпак/i.test(catalogText)) {
      return {
        status: "partial",
        matchedProduct: targetProduct,
        note: "Тип шапочки — сверьте берет/колпак в приложении к РУ",
      };
    }
  }

  if (/фиксац|резинк|завязк/i.test(fieldLower) && /резинк|завязк|тесьм/i.test(valueLower)) {
    if (isSurgicalCapLine(parentProduct) || /шапоч|берет/i.test(catalogText)) {
      return {
        status: "partial",
        matchedProduct: targetProduct,
        note: "Способ фиксации — сверьте с приложением к РУ",
      };
    }
  }

  if (/плотност/i.test(fieldLower)) {
    return { status: "partial", matchedProduct: targetProduct, note: "Сверьте плотность по декларации / приложению РУ" };
  }

  if (/^размер/i.test(fieldLower)) {
    return { status: "partial", matchedProduct: targetProduct, note: "Сверьте размерную сетку в приложении к РУ" };
  }

  if (/застежк|ворот|рукав|липучк|резинк/i.test(fieldLower)) {
    const tokens = valueLower.split(/[\s,.]+/).filter((w) => w.length > 3);
    if (tokens.some((t) => catalogText.includes(t))) {
      return { status: "match", matchedProduct: targetProduct, note: "Параметр найден в тексте РУ" };
    }
    return { status: "partial", matchedProduct: targetProduct, note: "Уточните конструктивные параметры в РУ" };
  }

  if (/срок\s+годности|остаточн/i.test(fieldLower)) {
    return { status: "partial", matchedProduct: targetProduct, note: "Сверьте срок годности на дату поставки" };
  }

  const valueWords = valueLower.split(/[\s,.]+/).filter((w) => w.length > 3);
  const hits = valueWords.filter((w) => catalogText.includes(w));
  if (hits.length >= Math.min(2, valueWords.length) && hits.length > 0) {
    return { status: "match", matchedProduct: targetProduct, note: "Параметр подтверждается текстом РУ" };
  }

  if (parentMatch.status === "match") {
    return {
      status: "partial",
      matchedProduct: targetProduct,
      note: "Параметр не найден явно в РУ — проверьте приложение",
    };
  }

  return { status: "partial", matchedProduct: targetProduct, note: parentMatch.note };
}

function isMedicalTenderCtx(
  requirements: TenderRequirements,
  tenderOkved: string | null,
  tenderCategory?: string,
  tenderTitle?: string
): boolean {
  return isMedicalTenderVertical(
    { category: tenderCategory ?? "", okvedCode: tenderOkved, title: tenderTitle },
    requirements
  );
}

function buildSpecMatches(
  productSpecs: string[],
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): SpecMatch[] {
  const capped = productSpecs.slice(0, 48);
  if (capped.length === 0) return [];
  return capped.map((raw) => {
    const spec = normalizeTzSpecText(raw);
    const m = specMatchesCatalog(spec, catalogProducts, catalogStructured);
    if (m.matched) return { spec, status: "match" as const, note: m.note };
    if (m.partial) return { spec, status: "partial" as const, note: m.note };
    return { spec, status: "missing" as const, note: catalogProducts.length > 0 ? m.note : "Загрузите РУ с приложением — перечень изделий" };
  });
}

export function analyzeMatch(
  docs: UploadedDoc[],
  company: CompanyProfile,
  requirements: TenderRequirements,
  tenderOkved: string | null,
  tenderRegion: string | null,
  tenderMeta?: { category?: string; title?: string }
): AnalysisResult {
  const strengths: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const missingDocs: string[] = [];
  let score = 50;

  // Только документы, подтверждённые AI как релевантные
  const relevantDocs = docs.filter((d) => d.isRelevant === true);
  const irrelevantDocsCount = docs.length - relevantDocs.length;

  const supplierProfile = isTradeSupplier(company.okvedCodes);

  if (docs.length > 0 && relevantDocs.length === 0) {
    return {
      score: 5,
      strengths: [],
      warnings: ["Ни один загруженный документ не прошёл AI-проверку как корпоративный."],
      blockers: ["Нет действующих документов для участия в тендерах."],
      missingDocs: supplierProfile
        ? ["РУ или сертификаты на продукцию", "Реестр контрактов ЕИС"]
        : requirements.requiredDocs || ["Выписка ЕГРЮЛ", "Бухгалтерский баланс"],
      recommendation: supplierProfile
        ? "Загрузите РУ, сертификаты на продукцию и реестр контрактов. Оборот укажите в профиле."
        : "Загрузите реальные документы компании: лицензии, сертификаты, выписку ЕГРЮЛ.",
      irrelevantDocsCount,
      specMatches: buildSpecMatches(requirements.productSpecs || [], []),
      catalogProducts: [],
      catalogRuSources: [],
      excludedRuCount: 0,
      nomenclatureMismatch: false,
    };
  }

  if (irrelevantDocsCount > 0) {
    warnings.push(`${irrelevantDocsCount} файл(ов) отклонены AI — не являются корпоративными документами.`);
    score -= irrelevantDocsCount * 5;
  }

  // Используем aiDocType если он есть, иначе type выбранный пользователем
  const effectiveDocs = relevantDocs.map((d) => ({
    ...d,
    effectiveType: d.aiDocType && d.aiDocType !== "другое" ? d.aiDocType : d.type,
  }));

  const docTypes = effectiveDocs.map((d) => d.effectiveType);
  // Для удобства — также смотрим по оригинальным типам
  const originalTypes = relevantDocs.map((d) => d.type);

  // 1. Проверка лицензий
  const requiredLicenses = requirements.licenses || [];
  for (const license of requiredLicenses) {
    const hasIt = originalTypes.some((dt) => hasLicenseMatch(dt, license)) ||
                  docTypes.some((dt) => hasLicenseMatch(dt, license));
    if (hasIt) {
      score += 15;
      strengths.push(`Лицензия найдена: ${license.substring(0, 60)}${license.length > 60 ? "..." : ""}`);
    } else {
      score -= 20;
      blockers.push(`Отсутствует: ${license}`);
      missingDocs.push(license);
    }
  }

  // 2. Проверка финансового оборота — сначала оборот из профиля, баланс не обязателен
  if (requirements.minRevenue) {
    if (company.revenue) {
      if (company.revenue >= requirements.minRevenue) {
        score += 10;
        strengths.push(
          `Оборот ${formatMoney(company.revenue)} (из профиля) — превышает минимальный ${formatMoney(requirements.minRevenue)}`
        );
      } else {
        score -= 15;
        blockers.push(`Оборот ${formatMoney(company.revenue)} меньше требуемого ${formatMoney(requirements.minRevenue)}`);
      }
    } else {
      const hasBalance = originalTypes.includes("balance") || docTypes.some((t) => t.includes("баланс"));
      if (hasBalance) {
        warnings.push(
          `Тендер требует оборот от ${formatMoney(requirements.minRevenue)} — укажите сумму в профиле для точного сравнения`
        );
        score -= 3;
      } else if (supplierProfile) {
        warnings.push(
          `Укажите годовой оборот в профиле — тендер требует от ${formatMoney(requirements.minRevenue)}. Баланс загружать не обязательно.`
        );
        score -= 5;
      } else {
        warnings.push(
          `Укажите оборот в профиле или загрузите баланс — тендер требует от ${formatMoney(requirements.minRevenue)}`
        );
        score -= 5;
      }
    }
  }

  // 3. Проверка ОКВЭД
  if (tenderOkved) {
    const okvedMatch = company.okvedCodes.some(
      (code) => code === tenderOkved || code.startsWith(tenderOkved.split(".")[0])
    );
    if (okvedMatch) {
      score += 10;
      strengths.push(`ОКВЭД компании совпадает с категорией тендера (${tenderOkved})`);
    } else {
      score -= 10;
      warnings.push(`ОКВЭД тендера (${tenderOkved}) не входит в ваши виды деятельности`);
    }
  }

  // 4. Проверка региона
  if (tenderRegion && company.region) {
    const regionMatch =
      company.region.toLowerCase().includes(tenderRegion.toLowerCase()) ||
      tenderRegion.toLowerCase().includes(company.region.toLowerCase()) ||
      company.region === "Другой регион";
    if (regionMatch) {
      score += 5;
      strengths.push(`Регион тендера (${tenderRegion}) совпадает с вашим операционным регионом`);
    } else {
      warnings.push(`Тендер из региона "${tenderRegion}" — вы указали "${company.region}". Уточните если работаете в этом регионе`);
      score -= 5;
    }
  }

  // 5. Проверка опыта (контракты ЕИС)
  if (requirements.experience && requirements.experience.length > 0) {
    const hasContracts = originalTypes.includes("contracts") || docTypes.some((t) => t.includes("контракт"));
    if (hasContracts) {
      score += 10;
      strengths.push("Реестр исполненных контрактов загружен — подтверждает ваш опыт");
    } else {
      warnings.push(`Требуется опыт: ${requirements.experience} — загрузите реестр контрактов ЕИС`);
      missingDocs.push("Реестр контрактов ЕИС");
      score -= 8;
    }
  }

  // 6. Обязательные документы для подачи заявки
  const requiredForBid = requirements.requiredDocs || [];
  for (const reqDoc of requiredForBid) {
    const hasIt = originalTypes.some((dt) => hasLicenseMatch(dt, reqDoc));
    if (!hasIt && !missingDocs.includes(reqDoc)) {
      missingDocs.push(reqDoc);
    }
  }

  // 7. Выписка ЕГРЮЛ — для поставщиков не требуем
  if (
    !supplierProfile &&
    !originalTypes.includes("egrul") &&
    !docTypes.some((t) => t.includes("ЕГРЮЛ") || t.includes("егрюл"))
  ) {
    warnings.push("Рекомендуем загрузить выписку ЕГРЮЛ — может понадобиться при подаче заявки");
    if (!missingDocs.includes("Выписка ЕГРЮЛ")) missingDocs.push("Выписка ЕГРЮЛ");
    score -= 3;
  }

  // 8. Каталог изделий — только из РУ, релевантных номенклатуре ЭТОГО тендера
  const productSpecs = requirements.productSpecs || [];
  const tzProducts = requirements.tzProducts || [];
  const catalogDocs = effectiveDocs.filter(isCatalogDoc);
  const searchLines = tenderNomenclatureLines(
    tenderMeta?.title,
    tenderMeta?.category,
    tzProducts,
    productSpecs
  );
  const relevantCatalogDocs = selectRelevantCatalogDocs(catalogDocs, searchLines);
  const excludedRuCount = catalogDocs.length - relevantCatalogDocs.length;
  const catalogProducts = relevantCatalogDocs.flatMap((d) => d.products || []);
  const catalogStructured = relevantCatalogDocs.flatMap((d) => d.catalogItems || []);
  const catalogRuSources: CatalogRuSource[] = relevantCatalogDocs.map((d) => ({
    number: d.ruNumber || d.name,
    name: d.name,
    productCount: d.products?.length || d.productCount || 0,
  }));
  const medicalTender = isMedicalTenderCtx(
    requirements,
    tenderOkved,
    tenderMeta?.category,
    tenderMeta?.title
  );
  const tenderFamilies = tenderContextFamilies(searchLines);
  let nomenclatureMismatch = false;
  const tenderTitle = tenderMeta?.title ?? "";

  if (
    isNonMedicalConsumerTextileTender(tenderTitle, ...tzProducts.slice(0, 3)) ||
    titleConflictsWithTzProducts(tenderTitle, tzProducts)
  ) {
    nomenclatureMismatch = true;
    blockers.push(
      titleConflictsWithTzProducts(tenderTitle, tzProducts)
        ? "Название закупки не совпадает с позицией в ТЗ — это не ваш ассортимент"
        : "Сувенирная или промо-продукция — не медизделия из вашего РУ"
    );
    score -= 30;
  }

  if (excludedRuCount > 0) {
    const excludedLabels = catalogDocs
      .filter((d) => !relevantCatalogDocs.includes(d))
      .map((d) => d.ruNumber || d.name)
      .join(", ");
    warnings.push(
      excludedRuCount === 1
        ? `1 РУ не относится к этому тендеру и не учитывается в сверке: ${excludedLabels}`
        : `${excludedRuCount} РУ не относятся к этому тендеру и не учитываются в сверке: ${excludedLabels}`
    );
  }

  if (catalogProducts.length > 0) {
    const catalogFamilies = catalogFamiliesFromProducts(catalogProducts);

    if (!familiesAreCompatible(tenderFamilies, catalogFamilies)) {
      nomenclatureMismatch = true;
      blockers.push(
        `Предмет закупки (${describeTenderFamilies(tenderFamilies)}) не совпадает с вашим РУ (${describeCatalogFamilies(catalogFamilies)})`
      );
      score -= 30;
    } else {
      const ruLabel = catalogRuSources.map((r) => r.number).join(", ");
      strengths.push(`РУ ${ruLabel}: ${catalogProducts.length} позиций в каталоге`);

      let tzFullMatches = 0;
      let tzPartialMatches = 0;
      for (const name of tzProducts.slice(0, 24)) {
        const m = specMatchesCatalog(name, catalogProducts, catalogStructured);
        if (m.matched) {
          tzFullMatches++;
          strengths.push(`Позиция ТЗ: ${name.slice(0, 60)} — ${m.note}`);
        } else if (m.partial) {
          tzPartialMatches++;
          warnings.push(`Позиция ТЗ: ${name.slice(0, 60)} — ${m.note}`);
        }
      }
      if (tzFullMatches > 0) score += Math.min(24, tzFullMatches * 8);

      if (productSpecs.length > 0) {
        let fullMatches = 0;
        let partialMatches = 0;
        const technicalSpecs = productSpecs.filter(isTechnicalSpec).slice(0, 40);
        let technicalFullMatches = 0;

        for (const spec of technicalSpecs) {
          const m = specMatchesCatalog(spec, catalogProducts, catalogStructured);
          if (m.matched) {
            fullMatches++;
            if (isTechnicalSpec(spec)) technicalFullMatches++;
            strengths.push(`ТЗ: ${spec.slice(0, 50)} — ${m.note}`);
          } else if (m.partial) {
            partialMatches++;
            warnings.push(`ТЗ: ${spec.slice(0, 50)} — ${m.note}`);
          }
        }

        if (fullMatches > 0) score += Math.min(12, fullMatches * 4);

        const tenderElectronic =
          tenderFamilies.has("medical_electronic") || tenderFamilies.has("medical_implant_cardiac");
        const catalogTextileOnly =
          catalogFamilies.has("medical_textile") &&
          !catalogFamilies.has("medical_electronic") &&
          !catalogFamilies.has("medical_implant_cardiac");

        if (
          technicalSpecs.length >= 2 &&
          technicalFullMatches === 0 &&
          tenderElectronic &&
          catalogTextileOnly
        ) {
          nomenclatureMismatch = true;
          blockers.push(
            "Предмет закупки — электронные/имплантируемые изделия, а в РУ только текстиль и бельё"
          );
          score -= 25;
        } else if (
          tzFullMatches === 0 &&
          tzPartialMatches === 0 &&
          fullMatches === 0 &&
          productSpecs.length >= 2
        ) {
          nomenclatureMismatch = true;
          warnings.push("Характеристики из ТЗ не подтверждаются позициями вашего РУ");
          score -= 20;
        } else if (partialMatches > 0 && fullMatches === 0 && tzFullMatches === 0) {
          warnings.push("Есть только слабые совпадения по характеристикам — проверьте параметры вручную");
          score -= 5;
        }
      } else if (tzFullMatches > 0) {
        score += 4;
      } else if (medicalTender && familiesAreCompatible(tenderFamilies, catalogFamilies)) {
        score += 4;
        strengths.push("Медицинский тендер — РУ по смежной номенклатуре");
      }
    }
  } else if (catalogDocs.length > 0 && medicalTender) {
    const allCatalogFamilies = catalogFamiliesFromProducts(
      catalogDocs.flatMap((d) => d.products || [])
    );
    const fullCatalogProducts = catalogDocs.flatMap((d) => d.products || []);
    const probeLines = [
      ...tzProducts,
      tenderTitle.replace(/^поставка\s+/i, "").trim(),
    ].filter((l) => l && l.length >= 8);
    const hasProductHit = probeLines.some((line) => {
      const m = matchProductToCatalog(line, fullCatalogProducts, catalogStructured);
      return m.status !== "missing";
    });

    if (!familiesAreCompatible(tenderFamilies, allCatalogFamilies)) {
      nomenclatureMismatch = true;
      blockers.push(
        `Предмет закупки: ${describeTenderFamilies(tenderFamilies)}. Ваши РУ: ${describeCatalogFamilies(allCatalogFamilies)} — разные виды изделий`
      );
      score -= 25;
      score = Math.min(score, 38);
      missingDocs.push("РУ на изделия из данного тендера");
    } else if (!hasProductHit) {
      nomenclatureMismatch = true;
      warnings.push(
        "Загруженные РУ не покрывают номенклатуру этого тендера — для участия нужно РУ на соответствующие изделия"
      );
      missingDocs.push("РУ на изделия из данного тендера");
      score -= 25;
      score = Math.min(score, 38);
    } else {
      warnings.push(
        "Сверка по каталогу РУ: позиция найдена, но характеристики ТЗ нужно проверить вручную"
      );
    }
  } else if (medicalTender) {
    const hasSingleCert = effectiveDocs.some(
      (d) => d.effectiveType === "certificate" && d.documentScope === "single_product"
    );
    if (hasSingleCert) {
      warnings.push("Есть сертификат на 1 товар, но для медтендеров нужно РУ Росздравнадзора с приложением — полный перечень изделий");
      missingDocs.push("Регистрационное удостоверение (РУ) с приложением");
      score -= 10;
    } else {
      warnings.push("Медицинский тендер — загрузите РУ Росздравнадзора с перечнем изделий в приложении");
      missingDocs.push("Регистрационное удостоверение (РУ)");
      score -= 12;
    }
  }

  if (nomenclatureMismatch) {
    score = Math.min(score, 35);
    if (blockers.length === 0) {
      blockers.push(
        `Предмет закупки (${describeTenderFamilies(tenderFamilies)}) не совпадает с вашим РУ (${describeCatalogFamilies(catalogFamiliesFromProducts(catalogDocs.flatMap((d) => d.products || [])))})`
      );
    }
  }

  score = Math.max(5, Math.min(98, score));

  let recommendation = "";
  if (relevantDocs.length === 0) {
    recommendation = "Нет подходящих документов для анализа. Загрузите лицензии, сертификаты ГОСТ, выписку ЕГРЮЛ.";
  } else if (nomenclatureMismatch) {
    recommendation =
      "Тендер не по вашей номенклатуре: РУ и каталог изделий относятся к другому виду продукции. Участие не рекомендуется без соответствующего РУ.";
  } else if (score >= 80) {
    recommendation = "Отличный вариант — у вас есть большинство необходимых документов. Рекомендуем подавать заявку.";
  } else if (score >= 60) {
    recommendation = `Хороший потенциал. ${missingDocs.length > 0 ? `Перед подачей получите: ${missingDocs.slice(0, 2).join(", ")}.` : "Подготовьте документы к подаче."}`;
  } else if (score >= 40) {
    recommendation = `Участие возможно, но есть серьёзные пробелы. ${blockers.length > 0 ? `Критичные: ${blockers[0].substring(0, 80)}.` : "Изучите требования детально."}`;
  } else {
    recommendation = "Тендер не совпадает с текущим профилем компании. Для участия потребуется существенная подготовка документов.";
  }

  return {
    score,
    strengths,
    warnings,
    blockers,
    missingDocs,
    recommendation,
    irrelevantDocsCount,
    specMatches: buildSpecMatches(productSpecs, catalogProducts, catalogStructured),
    catalogProducts,
    catalogRuSources,
    excludedRuCount,
    nomenclatureMismatch,
  };
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

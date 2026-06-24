/**
 * Фокус компании по описанию и каталогу РУ — для фильтрации ленты тендеров.
 */

import {
  detectProductFamilies,
  familiesAreCompatible,
  normalizeMatchText,
  type ProductFamily,
} from "@/lib/productFamilies";
import { isNonMedicalConsumerTextileTender } from "@/lib/tzSanitizer";

export interface CompanyFocus {
  sourceText: string;
  families: Set<ProductFamily>;
  keywords: string[];
  labels: string[];
  textileFocused: boolean;
}

const FOCUS_LABELS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "нетканные материалы", patterns: [/неткан/i, /спанбонд/i, /\bсмс\b/i, /мельтблаун/i] },
  { label: "медицинское бельё", patterns: [/бель[её]/i, /простын/i, /наволоч/i, /операционн.*бель/i] },
  { label: "хирургические халаты и маски", patterns: [/халат/i, /маск/i, /шапоч/i, /колпач/i] },
  { label: "салфетки и перевязка", patterns: [/салфет/i, /марл/i, /бинт/i, /повязк/i] },
  { label: "перчатки и расходники", patterns: [/перчат/i, /шприц/i, /\bигл/i, /катетер/i] },
  { label: "медоборудование", patterns: [/оборудован/i, /аппарат/i, /монитор/i, /томограф/i] },
  { label: "импланты и кардиология", patterns: [/кардиостимулятор/i, /электрод/i, /имплант/i] },
];

const STOP = new Set([
  "компания", "занимается", "поставляет", "поставка", "работаем", "регион",
  "медицинские", "медицинское", "медицинских", "изделия", "изделий", "продукция",
  "россии", "российской", "федерации", "деятельность", "основной",
]);

/** Тендер явно не по профилю текстиля / нетканки */
const TEXTILE_MISMATCH_PATTERNS: RegExp[] = [
  /кардиостимулятор/i,
  /электрокардиостимулятор/i,
  /электрод/i,
  /имплантируем/i,
  /дефибриллятор/i,
  /гинеколог/i,
  /акушерск/i,
  /влагалищ/i,
  /урологическ.*катетер/i,
  /томограф/i,
  /рентген/i,
  /маммограф/i,
  /лабораторн.*анализатор/i,
  /эндоскоп/i,
  /стент\b/i,
  /коронарн/i,
  /пластин/i,
  /остеосинтез/i,
  /блокировк.*зон/i,
  /\bвинт/i,
  /титанов/i,
  /эндопротез/i,
  /лекарственн/i,
  /\bпрепарат/i,
  /фармацевт/i,
  /жнвлп/i,
  /оказани[ея]\s+услуг/i,
  /медицинск\w*\s+осмотр/i,
  /диспансеризац/i,
  /\bпцр\b/i,
  /пцр-диагност/i,
  /зонд\s*[–—-]\s*тампон/i,
  /тампон\s+для\s+взят/i,
  /микропробир/i,
  /устройств\w*\s+для\s+печат/i,
  /печат\w*\s+монохром/i,
  /медицинских\s+изображен/i,
  /принтер/i,
  /плоттер/i,
];

export function buildCompanyFocus(input: {
  description?: string | null;
  catalogProducts?: string[];
}): CompanyFocus {
  const sourceText = [input.description, ...(input.catalogProducts || [])]
    .filter(Boolean)
    .join(" ");
  const normalized = normalizeMatchText(sourceText);
  const families = detectProductFamilies(sourceText);

  const labels: string[] = [];
  for (const item of FOCUS_LABELS) {
    if (item.patterns.some((re) => re.test(sourceText))) {
      labels.push(item.label);
    }
  }

  const keywords = normalized
    .split(" ")
    .filter((w) => w.length > 4 && !STOP.has(w))
    .slice(0, 25);

  const textileFocused =
    families.has("medical_textile") ||
    labels.some((l) => /неткан|бель|салфет|бахил|халат|шапоч/i.test(l)) ||
    /неткан|бель[её]|салфет|бахил|операционн/i.test(sourceText);

  return { sourceText, families, keywords, labels, textileFocused };
}

export interface TenderRelevanceResult {
  score: number;
  excluded: boolean;
  reason: string;
}

function tenderBlob(tender: {
  title?: string;
  category?: string;
  requirements?: string | Record<string, unknown>;
}): string {
  let reqs: Record<string, unknown> = {};
  if (typeof tender.requirements === "string") {
    try {
      reqs = JSON.parse(tender.requirements);
    } catch {
      reqs = {};
    }
  } else if (tender.requirements) {
    reqs = tender.requirements as Record<string, unknown>;
  }

  const parts = [
    tender.title ?? "",
    tender.category ?? "",
    ...((reqs.tzProducts as string[]) || []),
    ...((reqs.productSpecs as string[]) || []).slice(0, 15),
  ];
  return normalizeMatchText(parts.join(" "));
}

export function scoreTenderRelevance(
  tender: { title?: string; category?: string; requirements?: string | Record<string, unknown> },
  focus: CompanyFocus
): TenderRelevanceResult {
  const blob = tenderBlob(tender);
  if (!blob || blob.length < 8) {
    return { score: 0, excluded: false, reason: "мало данных в извещении" };
  }

  if (focus.textileFocused && isNonMedicalConsumerTextileTender(tender.title ?? "", blob)) {
    return {
      score: 0,
      excluded: true,
      reason: "сувенирная или промо-продукция — не медизделия",
    };
  }

  const tenderFamilies = detectProductFamilies(blob);

  if (focus.textileFocused) {
    for (const re of TEXTILE_MISMATCH_PATTERNS) {
      if (re.test(blob)) {
        return {
          score: 0,
          excluded: true,
          reason: `не ваша номенклатура (${blob.match(re)?.[0] ?? "другой вид изделий"})`,
        };
      }
    }
  }

  if (/лекарственн\w*\s+препарат|\bмнн\s*[–—:-]|\bжнвлп\b/i.test(blob)) {
    return {
      score: 0,
      excluded: true,
      reason: "лекарственные препараты — не поставка медизделий",
    };
  }

  if (!familiesAreCompatible(tenderFamilies, focus.families) && focus.families.size > 0) {
    const hasKnownFocus = [...focus.families].some((f) => f !== "unknown");
    const hasKnownTender = [...tenderFamilies].some((f) => f !== "unknown");
    if (hasKnownFocus && hasKnownTender) {
      return {
        score: 0,
        excluded: true,
        reason: "другой вид медизделий — не совпадает с профилем компании",
      };
    }
  }

  let score = 0;
  let hits = 0;
  for (const kw of focus.keywords) {
    if (blob.includes(kw)) {
      hits++;
      score += 8;
    }
  }

  for (const item of FOCUS_LABELS) {
    if (!focus.labels.includes(item.label)) continue;
    if (item.patterns.some((re) => re.test(blob))) {
      score += 20;
      hits++;
    }
  }

  if (focus.textileFocused && /неткан|бель[её]|салфет|бахил|халат|шапоч|простын|операционн/i.test(blob)) {
    score += 25;
    hits++;
  }

  if (hits === 0 && focus.labels.length > 0) {
    return {
      score: Math.max(0, score),
      excluded: focus.textileFocused,
      reason: focus.textileFocused
        ? "нет совпадения с нетканками / бельём из профиля"
        : "слабое совпадение с описанием компании",
    };
  }

  return {
    score: Math.min(100, score),
    excluded: false,
    reason: hits > 0 ? "совпадение с профилем" : "общий медтендер",
  };
}

const RELEVANCE_SHOW_THRESHOLD = 15;

export function filterTendersForCompanyProfile<
  T extends { title?: string; category?: string; requirements?: string | Record<string, unknown> },
>(tenders: T[], focus: CompanyFocus): Array<T & { relevanceScore: number; relevanceReason: string }> {
  const hasFocus =
    focus.textileFocused ||
    focus.labels.length > 0 ||
    focus.keywords.length >= 3 ||
    focus.sourceText.length > 40;

  if (!hasFocus) {
    return tenders.map((t) => ({
      ...t,
      relevanceScore: 40,
      relevanceReason: "уточните описание компании для точного подбора",
    }));
  }

  return tenders
    .map((t) => {
      const rel = scoreTenderRelevance(t, focus);
      return { tender: t, ...rel };
    })
    .filter((row) => !row.excluded && row.score >= RELEVANCE_SHOW_THRESHOLD)
    .map((row) => ({
      ...row.tender,
      relevanceScore: row.score,
      relevanceReason: row.reason,
    }));
}

export function focusSummary(focus: CompanyFocus): string {
  if (focus.labels.length > 0) return focus.labels.slice(0, 3).join(", ");
  if (focus.textileFocused) return "нетканные материалы и мед. текстиль";
  if (focus.keywords.length > 0) return focus.keywords.slice(0, 4).join(", ");
  return "профиль компании";
}

export interface EisSearchQuery {
  query: string;
  category: string;
  okved: string;
}

/** Поисковые запросы ЕИС по профилю компании — приоритет при синхронизации */
export function buildImportQueriesFromFocus(focus: CompanyFocus): EisSearchQuery[] {
  const seen = new Set<string>();
  const out: EisSearchQuery[] = [];

  const add = (query: string, category: string, okved = "46.46") => {
    const key = query.toLowerCase().trim();
    if (key.length < 4 || seen.has(key)) return;
    seen.add(key);
    out.push({ query, category, okved });
  };

  if (focus.textileFocused) {
    add("нетканое полотно медицинское", "Нетканка", "32.50");
    add("белье медицинское одноразовое", "Медбельё", "46.46");
    add("комплект белья стерильный", "Медбельё", "46.46");
    add("простыни медицинские одноразовые", "Медбельё", "46.46");
    add("салфетки медицинские нетканые", "Расходники", "46.46");
    add("халаты хирургические одноразовые", "Медтекстиль", "46.46");
    add("маски медицинские одноразовые", "Медтекстиль", "46.46");
    add("бахилы медицинские", "Медтекстиль", "46.46");
    add("перевязочные материалы медицинские", "Расходники", "32.50");
    add("марлевые салфетки стерильные", "Расходники", "32.50");
    add("покрывало стерильное", "Медтекстиль", "46.46");
    add("набор хирургический стерильный", "Медбельё", "46.46");
    add("одежда для операционной", "Медтекстиль", "46.46");
    add("полотно нетканое", "Нетканка", "32.50");
    add("комплект постельный медицинский", "Медбельё", "46.46");
  }

  for (const label of focus.labels) {
    if (/неткан/i.test(label)) add("нетканные материалы медицинские", "Нетканка", "32.50");
    if (/бель/i.test(label)) add("белье медицинское стерильное", "Медбельё", "46.46");
    if (/салфет|перевяз/i.test(label)) add("салфетки марлевые медицинские", "Расходники", "32.50");
    if (/халат|маск/i.test(label)) add("халаты медицинские одноразовые", "Медтекстиль", "46.46");
  }

  for (const kw of focus.keywords.slice(0, 6)) {
    if (kw.length >= 5) add(kw, "По профилю", "46.46");
  }

  return out;
}

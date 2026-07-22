/**
 * Ранжирование ленты: профиль компании + сверка номенклатуры ТЗ с каталогом РУ.
 * Тендеры без покрытия в РУ не попадают в ленту (если каталог загружен).
 */

import type { CompanyFocus } from "@/lib/companyFocus";
import { scoreTenderRelevance } from "@/lib/companyFocus";
import type { StructuredCatalogItem } from "@/lib/productDimensions";
import {
  analyzeMatch,
  mapCompanyDocuments,
  matchProductToCatalog,
  type UploadedDoc,
} from "@/lib/matching";
import {
  buildNomenclatureMatchTable,
  blockNomenclatureMatches,
  computeParticipationForecast,
  extractProcurementItems,
  resolveProcurementKind,
  type ParticipationForecast,
  type ProcurementItem,
} from "@/lib/tenderPresentation";
import {
  detectProductFamilies,
  familiesAreCompatible,
  catalogFamiliesFromProducts,
} from "@/lib/productFamilies";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import type { NomenclatureMatchRow } from "@/lib/tenderPresentation";
import {
  isPharmaceuticalProcurement,
  isServiceProcurement,
  isWorksProcurement,
  shouldBlockRuCatalogMatch,
  type ProcurementKind,
} from "@/lib/tzSanitizer";

type CompanyProfile = {
  okvedCodes: string[];
  revenue: number | null;
  region: string | null;
  description: string | null;
};

export interface TenderRankInput {
  id?: string;
  title?: string;
  category?: string;
  okvedCode?: string | null;
  region?: string | null;
  requirements?: string | Record<string, unknown>;
  publishedAt?: Date;
  deadline?: Date;
}

export interface TenderFeedRank {
  feedScore: number;
  relevanceScore: number;
  matchScore: number | null;
  ruMatched: number;
  ruPartial: number;
  ruMissing: number;
  ruTotal: number;
  ruCoveragePercent: number;
  forecastChance: number;
  forecastLevel: "high" | "medium" | "low" | "none";
  showInFeed: boolean;
  hideReason?: string;
  relevanceReason: string;
}

function parseRequirements(requirements?: string | Record<string, unknown>): Record<string, unknown> {
  if (!requirements) return {};
  if (typeof requirements === "string") {
    try {
      return JSON.parse(requirements);
    } catch {
      return {};
    }
  }
  return requirements;
}

function tenderSearchBlobFromReqs(tender: TenderRankInput, reqs: Record<string, unknown>): string {
  return [
    tender.title ?? "",
    tender.category ?? "",
    ...((reqs.tzProducts as string[]) || []),
  ]
    .join(" ")
    .toLowerCase();
}

function tenderSearchBlob(tender: TenderRankInput): string {
  return tenderSearchBlobFromReqs(tender, parseRequirements(tender.requirements));
}

function hasFamilyBlockerFromReqs(
  tender: TenderRankInput,
  catalogProducts: string[],
  reqs: Record<string, unknown>
): boolean {
  if (catalogProducts.length === 0) return false;
  const blob = tenderSearchBlobFromReqs(tender, reqs);
  const tenderFamilies = detectProductFamilies(blob);
  const catalogFamilies = catalogFamiliesFromProducts(catalogProducts);
  return !familiesAreCompatible(tenderFamilies, catalogFamilies);
}

function hasFamilyBlocker(tender: TenderRankInput, catalogProducts: string[]): boolean {
  return hasFamilyBlockerFromReqs(tender, catalogProducts, parseRequirements(tender.requirements));
}

interface CoverageAssessment {
  ruMatched: number;
  ruPartial: number;
  ruMissing: number;
  ruTotal: number;
  ruCoveragePercent: number;
  nomRows: NomenclatureMatchRow[];
  procurementItems: ProcurementItem[];
  procurementKind: ProcurementKind;
  familyBlocked: boolean;
  catalogMatchBlocked: boolean;
  pharmaBlocked: boolean;
  tzEnrichmentPending: boolean;
}

function assessNomenclatureCoverage(
  tender: TenderRankInput,
  catalogProducts: string[],
  catalogStructured: StructuredCatalogItem[] | undefined,
  parsedReqs: Record<string, unknown>
): CoverageAssessment {
  const empty: CoverageAssessment = {
    ruMatched: 0,
    ruPartial: 0,
    ruMissing: 0,
    ruTotal: 0,
    ruCoveragePercent: 0,
    nomRows: [],
    procurementItems: [],
    procurementKind: "unknown",
    familyBlocked: false,
    catalogMatchBlocked: false,
    pharmaBlocked: false,
    tzEnrichmentPending: parsedReqs.tzEnrichmentPending === true,
  };

  if (catalogProducts.length === 0) return empty;

  const reqs = normalizeStoredRequirements({
    productSpecs: (parsedReqs.productSpecs as string[]) || [],
    tzProducts: (parsedReqs.tzProducts as string[]) || [],
    tzVolumes:
      (parsedReqs.tzVolumes as Array<{
        name?: string;
        quantity: number;
        unit?: string;
        position?: string;
        ktruCode?: string;
      }>) || [],
    technicalAssignment: (parsedReqs.technicalAssignment as string) || "",
  });

  const pharmaBlob = [
    tender.title ?? "",
    ...(reqs.tzProducts || []).slice(0, 4),
    ...(reqs.productSpecs || []).slice(0, 6),
  ].join(" ");
  const pharmaBlocked = isPharmaceuticalProcurement(pharmaBlob);

  const procurementKind = resolveProcurementKind(
    {
      tzProducts: reqs.tzProducts,
      productSpecs: reqs.productSpecs,
      technicalAssignment: reqs.technicalAssignment,
    },
    tender.title
  );

  if (procurementKind === "service" || procurementKind === "works" || pharmaBlocked) {
    return { ...empty, procurementKind, pharmaBlocked };
  }

  const familyBlocked = hasFamilyBlockerFromReqs(tender, catalogProducts, {
    ...parsedReqs,
    ...reqs,
  });

  const items = extractProcurementItems(
    {
      tzProducts: reqs.tzProducts,
      productSpecs: reqs.productSpecs,
      technicalAssignment: reqs.technicalAssignment,
      tzVolumes: reqs.tzVolumes?.map((v) => ({
        name: v.name || "",
        quantity: v.quantity,
        unit: v.unit || "шт",
        position: v.position,
        ktruCode: v.ktruCode,
      })),
    },
    tender.title
  );
  const nomRowsRaw = buildNomenclatureMatchTable(items, catalogProducts, catalogStructured);
  const hasNomenclatureHit = nomRowsRaw.some(
    (r) => r.status === "match" || r.status === "partial"
  );
  const ruBlock = shouldBlockRuCatalogMatch({
    tenderTitle: tender.title,
    tzProducts: reqs.tzProducts,
    nomenclatureMismatch: hasNomenclatureHit ? false : familyBlocked,
  });
  const catalogMatchBlocked = ruBlock.blocked;
  const nomRows = catalogMatchBlocked
    ? blockNomenclatureMatches(nomRowsRaw, ruBlock.reason)
    : nomRowsRaw;

  let ruMatched = nomRows.filter((r) => r.status === "match").length;
  let ruPartial = nomRows.filter((r) => r.status === "partial").length;
  let ruMissing = nomRows.filter((r) => r.status === "missing").length;
  let ruTotal = nomRows.length;

  const hasRawTzHint =
    ((parsedReqs.tzProducts as string[]) || []).length > 0 ||
    ((parsedReqs.productSpecs as string[]) || []).length > 5;

  if (
    ruTotal === 0 &&
    !empty.tzEnrichmentPending &&
    !hasRawTzHint &&
    tender.title
  ) {
    const titleProbe = tender.title.replace(/^поставка\s+/i, "").trim();
    if (
      titleProbe &&
      !isServiceProcurement(titleProbe) &&
      !isWorksProcurement(titleProbe) &&
      !isPharmaceuticalProcurement(titleProbe)
    ) {
      const m = matchProductToCatalog(titleProbe, catalogProducts, catalogStructured);
      if (m.status !== "missing") {
        ruTotal = 1;
        if (m.status === "match") ruMatched = 1;
        else if (m.status === "partial") ruPartial = 1;
        else ruMissing = 1;
      }
    }
  }

  const ruCoveragePercent =
    catalogMatchBlocked || familyBlocked
      ? 0
      : ruTotal > 0
        ? Math.min(
            parsedReqs.tzParsedFromFile === true || (ruMatched === ruTotal && ruPartial === 0)
              ? 100
              : 40,
            Math.round(((ruMatched + ruPartial * 0.4) / ruTotal) * 100)
          )
        : 0;

  return {
    ruMatched,
    ruPartial,
    ruMissing,
    ruTotal,
    ruCoveragePercent,
    nomRows,
    procurementItems: items,
    procurementKind,
    familyBlocked: familyBlocked || catalogMatchBlocked,
    catalogMatchBlocked,
    pharmaBlocked,
    tzEnrichmentPending: empty.tzEnrichmentPending,
  };
}

export interface TenderParticipationOptions {
  parsedReqs?: Record<string, unknown>;
  /** Оценка analyzeMatch (карточка); для ленты можно не передавать */
  analysisScore?: number;
  analysisBlockers?: string[];
  analysisNomenclatureMismatch?: boolean;
  hasCatalog?: boolean;
}

/** Единый расчёт % покрытия ТЗ и таблицы сверки — лента и карточка тендера */
export interface TenderParticipationResult {
  forecast: ParticipationForecast;
  nomRows: NomenclatureMatchRow[];
  procurementItems: ProcurementItem[];
  procurementKind: ProcurementKind;
  ruMatched: number;
  ruPartial: number;
  ruMissing: number;
  ruTotal: number;
  ruCoveragePercent: number;
  familyBlocked: boolean;
  nomenclatureMismatch: boolean;
  tzEnrichmentPending: boolean;
  pharmaBlocked: boolean;
}

export function computeTenderParticipation(
  tender: TenderRankInput,
  catalogProducts: string[],
  catalogStructured: StructuredCatalogItem[] | undefined,
  options: TenderParticipationOptions = {}
): TenderParticipationResult {
  const parsedReqs = options.parsedReqs ?? parseRequirements(tender.requirements);
  const coverage = assessNomenclatureCoverage(
    tender,
    catalogProducts,
    catalogStructured,
    parsedReqs
  );

  const hasNomenclatureHit =
    coverage.ruMatched + coverage.ruPartial > 0 ||
    coverage.nomRows.some((r) => r.status === "match" || r.status === "partial");

  const nomenclatureMismatch = hasNomenclatureHit
    ? false
    : options.analysisNomenclatureMismatch === true || coverage.familyBlocked;

  const hasBlockers =
    (options.analysisBlockers?.length ?? 0) > 0 && !hasNomenclatureHit;

  const hasCatalog = options.hasCatalog ?? catalogProducts.length > 0;

  const forecast = computeParticipationForecast(
    options.analysisScore ?? 50,
    coverage.nomRows,
    hasBlockers,
    hasCatalog,
    {
      procurementKind: coverage.procurementKind,
      tzEnrichmentPending: coverage.tzEnrichmentPending,
      tzParsedFromFile: parsedReqs.tzParsedFromFile === true,
      nomenclatureMismatch,
    }
  );

  return {
    forecast,
    nomRows: coverage.nomRows,
    procurementItems: coverage.procurementItems,
    procurementKind: coverage.procurementKind,
    ruMatched: coverage.ruMatched,
    ruPartial: coverage.ruPartial,
    ruMissing: coverage.ruMissing,
    ruTotal: coverage.ruTotal,
    ruCoveragePercent: forecast.coveragePercent ?? coverage.ruCoveragePercent,
    familyBlocked: coverage.familyBlocked,
    nomenclatureMismatch,
    tzEnrichmentPending: coverage.tzEnrichmentPending,
    pharmaBlocked: coverage.pharmaBlocked,
  };
}

/** Сверка позиций закупки с каталогом из РУ */
export function assessRuCoverage(
  tender: TenderRankInput,
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): Pick<TenderFeedRank, "ruMatched" | "ruPartial" | "ruMissing" | "ruTotal" | "ruCoveragePercent"> {
  const parsed = parseRequirements(tender.requirements);
  const c = assessNomenclatureCoverage(tender, catalogProducts, catalogStructured, parsed);
  return {
    ruMatched: c.ruMatched,
    ruPartial: c.ruPartial,
    ruMissing: c.ruMissing,
    ruTotal: c.ruTotal,
    ruCoveragePercent: c.ruCoveragePercent,
  };
}

export function rankTenderForFeed(
  tender: TenderRankInput,
  focus: CompanyFocus,
  catalogProducts: string[],
  docsForMatching: UploadedDoc[],
  company: CompanyProfile,
  options: { light?: boolean; catalogStructured?: StructuredCatalogItem[]; parsedReqs?: Record<string, unknown> } = {}
): TenderFeedRank {
  const rel = scoreTenderRelevance(tender, focus);
  const relevanceScore = rel.excluded ? 0 : rel.score;
  const relevanceReason = rel.reason;

  const light = options.light === true;
  const parsedReqs = options.parsedReqs ?? parseRequirements(tender.requirements);
  const catalogStructured =
    options.catalogStructured ?? docsForMatching.flatMap((d) => d.catalogItems || []);
  const hasCatalog = catalogProducts.length > 0;

  let matchScore: number | null = null;
  let analysisBlockers: string[] | undefined;
  let analysisNomenclatureMismatch: boolean | undefined;

  if (!light && docsForMatching.length > 0) {
    const analysis = analyzeMatch(
      docsForMatching,
      company,
      parsedReqs as Parameters<typeof analyzeMatch>[2],
      tender.okvedCode ?? null,
      tender.region ?? null,
      { category: tender.category, title: tender.title }
    );
    matchScore = analysis.score;
    analysisBlockers = analysis.blockers;
    analysisNomenclatureMismatch = analysis.nomenclatureMismatch;
  }

  const participation = computeTenderParticipation(
    tender,
    catalogProducts,
    catalogStructured,
    {
      parsedReqs,
      analysisScore: matchScore ?? 50,
      analysisBlockers,
      analysisNomenclatureMismatch,
      hasCatalog,
    }
  );

  const ru = participation;
  const procurementKind = participation.procurementKind;
  const isNonGoods =
    procurementKind === "service" || procurementKind === "works" || participation.pharmaBlocked;
  const familyBlocked = participation.familyBlocked || isNonGoods;

  const forecastChance =
    participation.forecast.coveragePercent ?? participation.forecast.chancePercent;
  const forecastLevel = participation.forecast.level;
  const hasBlockers =
    familyBlocked ||
    ((analysisBlockers?.length ?? 0) > 0 &&
      participation.ruMatched + participation.ruPartial === 0);

  let showInFeed = !rel.excluded;
  let hideReason: string | undefined;

  // Текстовая/keyword-эвристика профиля (rel.excluded) — грубее, чем прямое совпадение
  // конкретной позиции ТЗ с вашим РУ. Если РУ реально нашло совпадение по каталогу,
  // это сильнее и не должно перекрываться общей эвристикой профиля.
  const verifiedByRu = hasCatalog && ru.ruMatched > 0;

  if (rel.excluded && !verifiedByRu) {
    showInFeed = false;
    hideReason = rel.reason;
  } else if (hasCatalog) {
    showInFeed = true;
    const hasRuHit = ru.ruMatched + ru.ruPartial > 0;
    if (familyBlocked) {
      showInFeed = false;
      hideReason = participation.pharmaBlocked
        ? "лекарственные препараты — не медизделия из РУ"
        : isNonGoods
          ? "закупка услуг или работ — не поставка изделий"
          : "другой вид изделий — нет подходящего РУ";
    } else if (!hasRuHit) {
      showInFeed = false;
      hideReason = "номенклатура закупки не найдена в вашем РУ";
    } else if (hasBlockers && ru.ruMatched === 0) {
      showInFeed = false;
      hideReason = "ТЗ не покрывается вашим каталогом";
    }
  } else if (focus.textileFocused || focus.labels.length > 0) {
    if (relevanceScore < 15) {
      showInFeed = false;
      hideReason = rel.reason || "слабое совпадение с профилем";
    }
  }

  const feedScore = Math.round(
    ru.ruCoveragePercent * 0.5 +
      relevanceScore * 0.25 +
      (matchScore ?? forecastChance) * 0.25
  );

  const importMode = parsedReqs.importMode as string | undefined;
  let feedScoreAdjusted = feedScore;
  if (importMode === "tz_enriched") feedScoreAdjusted += 10;
  else if (importMode === "notice_enriched") feedScoreAdjusted += 4;
  else if (importMode === "search_only") feedScoreAdjusted -= 15;

  return {
    feedScore: Math.min(100, Math.max(0, feedScoreAdjusted)),
    relevanceScore,
    matchScore,
    ...ru,
    forecastChance,
    forecastLevel,
    showInFeed,
    hideReason,
    relevanceReason,
  };
}

export type RankedTender<T extends TenderRankInput> = T & TenderFeedRank;

export type TenderFeedMode = "matched" | "profile" | "catalog";

export interface FeedFilterOptions {
  mode?: TenderFeedMode;
  /** Без analyzeMatch на каждый тендер — для списков / дашборда */
  light?: boolean;
}

export interface FeedFilterStats {
  total: number;
  shown: number;
  hiddenProfile: number;
  hiddenNoRu: number;
}

/** Профиль → РУ-покрытие → сортировка по feedScore */
export function rankAndFilterTendersForFeed<T extends TenderRankInput>(
  tenders: T[],
  focus: CompanyFocus,
  documents: Parameters<typeof mapCompanyDocuments>[0],
  company: CompanyProfile,
  options: FeedFilterOptions = {}
): { tenders: RankedTender<T>[]; stats: FeedFilterStats } {
  const mode = options.mode ?? "matched";
  const light = options.light === true;
  const docsForMatching = mapCompanyDocuments(documents);
  const catalogProducts = docsForMatching
    .filter((d) => d.isRelevant && d.products?.length)
    .flatMap((d) => d.products || []);
  const catalogStructured = docsForMatching.flatMap((d) => d.catalogItems || []);

  const parsedById = new Map<string, Record<string, unknown>>();
  for (const t of tenders) {
    if (t.id) parsedById.set(t.id, parseRequirements(t.requirements));
  }

  let hiddenProfile = 0;
  let hiddenNoRu = 0;

  const ranked = tenders
    .map((t) => {
      const rank = rankTenderForFeed(t, focus, catalogProducts, docsForMatching, company, {
        light,
        catalogStructured,
        parsedReqs: t.id ? parsedById.get(t.id) : undefined,
      });
      return { ...t, ...rank };
    })
    .filter((t) => {
      if (mode === "catalog") {
        return true;
      }

      if (mode === "profile") {
        const excluded =
          t.relevanceScore < 15 ||
          !!t.hideReason?.match(/не ваша номенклатура|другой вид изделий|не совпадает с профилем/i);
        if (excluded) {
          hiddenProfile++;
          return false;
        }
        return true;
      }

      if (!t.showInFeed) {
        if (t.hideReason?.includes("РУ") || t.hideReason?.includes("каталог") || t.hideReason?.includes("изделий")) {
          hiddenNoRu++;
        } else {
          hiddenProfile++;
        }
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const scoreDiff = b.feedScore - a.feedScore;
      if (scoreDiff !== 0) return scoreDiff;
      const ruDiff = b.ruCoveragePercent - a.ruCoveragePercent;
      if (ruDiff !== 0) return ruDiff;
      return b.relevanceScore - a.relevanceScore;
    });

  return {
    tenders: ranked,
    stats: {
      total: tenders.length,
      shown: ranked.length,
      hiddenProfile,
      hiddenNoRu,
    },
  };
}

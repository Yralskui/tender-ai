/**
 * Фильтры ленты: срок подачи, сортировка, ключевые слова в названии.
 */

import type { Prisma } from "@/generated/prisma/client";
import { REAL_EIS_TENDER_WHERE } from "@/lib/tenderConstants";

export type FeedSortMode = "score" | "deadline" | "new";
export type FeedDeadlineFilter = "active" | "1d" | "3d" | "7d";

export interface TenderFeedFilters {
  sort: FeedSortMode;
  deadline: FeedDeadlineFilter;
  includeWords: string[];
  excludeWords: string[];
  priceMin: number | null;
  priceMax: number | null;
}

export const DEFAULT_FEED_FILTERS: TenderFeedFilters = {
  sort: "score",
  deadline: "active",
  includeWords: [],
  excludeWords: [],
  priceMin: null,
  priceMax: null,
};

export const PRICE_PRESET_OPTIONS = [
  { id: "all", label: "Любая НМЦК", min: null as number | null, max: null as number | null },
  { id: "100k", label: "до 100 тыс ₽", min: null, max: 100_000 },
  { id: "500k", label: "до 500 тыс ₽", min: null, max: 500_000 },
  { id: "1m", label: "до 1 млн ₽", min: null, max: 1_000_000 },
  { id: "1m-5m", label: "1–5 млн ₽", min: 1_000_000, max: 5_000_000 },
  { id: "5m+", label: "от 5 млн ₽", min: 5_000_000, max: null },
] as const;

export const INCLUDE_KEYWORD_PRESETS = [
  "марл",
  "халат",
  "шапоч",
  "бахил",
  "маск",
  "простын",
  "берет",
  "салфет",
];

export const EXCLUDE_KEYWORD_PRESETS = [
  "лекарств",
  "препарат",
  "таблетк",
  "ампул",
  "медикамент",
  "вакцин",
];

export function parseKeywordList(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;]+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2)
    ),
  ];
}

function parsePriceParam(raw?: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseFeedFilters(params: {
  sort?: string | null;
  deadline?: string | null;
  include?: string | null;
  exclude?: string | null;
  priceMin?: string | null;
  priceMax?: string | null;
}): TenderFeedFilters {
  const sort: FeedSortMode =
    params.sort === "deadline" || params.sort === "new" || params.sort === "score"
      ? params.sort
      : DEFAULT_FEED_FILTERS.sort;

  const deadline: FeedDeadlineFilter =
    params.deadline === "1d" ||
    params.deadline === "3d" ||
    params.deadline === "7d" ||
    params.deadline === "active"
      ? params.deadline
      : DEFAULT_FEED_FILTERS.deadline;

  return {
    sort,
    deadline,
    includeWords: parseKeywordList(params.include),
    excludeWords: parseKeywordList(params.exclude),
    priceMin: parsePriceParam(params.priceMin),
    priceMax: parsePriceParam(params.priceMax),
  };
}

export function matchPricePresetId(priceMin: number | null, priceMax: number | null): string {
  for (const preset of PRICE_PRESET_OPTIONS) {
    if (preset.min === priceMin && preset.max === priceMax) return preset.id;
  }
  if (priceMin != null || priceMax != null) return "custom";
  return "all";
}

export function formatPriceFilterLabel(priceMin: number | null, priceMax: number | null): string {
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} млн ₽`
      : n >= 1_000
        ? `${Math.round(n / 1_000)} тыс ₽`
        : `${n} ₽`;

  if (priceMin != null && priceMax != null) return `${fmt(priceMin)} – ${fmt(priceMax)}`;
  if (priceMax != null) return `до ${fmt(priceMax)}`;
  if (priceMin != null) return `от ${fmt(priceMin)}`;
  return "Любая НМЦК";
}

export function serializeFeedFilters(filters: TenderFeedFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.sort !== DEFAULT_FEED_FILTERS.sort) out.sort = filters.sort;
  if (filters.deadline !== DEFAULT_FEED_FILTERS.deadline) out.deadline = filters.deadline;
  if (filters.includeWords.length > 0) out.include = filters.includeWords.join(",");
  if (filters.excludeWords.length > 0) out.exclude = filters.excludeWords.join(",");
  if (filters.priceMin != null) out.priceMin = String(Math.round(filters.priceMin));
  if (filters.priceMax != null) out.priceMax = String(Math.round(filters.priceMax));
  return out;
}

function deadlineRange(filter: FeedDeadlineFilter): { gte?: Date; lte?: Date } | null {
  const now = new Date();
  switch (filter) {
    case "active":
      return { gte: now };
    case "1d": {
      const end = new Date(now);
      end.setDate(end.getDate() + 1);
      return { gte: now, lte: end };
    }
    case "3d": {
      const end = new Date(now);
      end.setDate(end.getDate() + 3);
      return { gte: now, lte: end };
    }
    case "7d": {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      return { gte: now, lte: end };
    }
    default:
      return { gte: now };
  }
}

/** Условие для Tender: ЕИС + срок + слова в названии */
export function buildFeedTenderWhere(
  filters: TenderFeedFilters,
  options: { allowExpired?: boolean; baseWhere?: Prisma.TenderWhereInput } = {}
): Prisma.TenderWhereInput {
  const parts: Prisma.TenderWhereInput[] = [options.baseWhere ?? REAL_EIS_TENDER_WHERE];

  if (!options.allowExpired) {
    const range = deadlineRange(filters.deadline);
    if (range) parts.push({ deadline: range });
  }
  // С метками — показываем и просроченные; фильтр срока не скрывает их

  if (filters.includeWords.length > 0) {
    parts.push({
      OR: filters.includeWords.map((w) => ({ title: { contains: w } })),
    });
  }

  for (const w of filters.excludeWords) {
    parts.push({ NOT: { title: { contains: w } } });
  }

  if (filters.priceMin != null || filters.priceMax != null) {
    const price: { gte?: number; lte?: number } = {};
    if (filters.priceMin != null) price.gte = filters.priceMin;
    if (filters.priceMax != null) price.lte = filters.priceMax;
    parts.push({ price });
  }

  return parts.length === 1 ? parts[0] : { AND: parts };
}

export function buildCachedMatchOrderBy(
  feedMode: "matched" | "profile" | "catalog",
  sort: FeedSortMode
): Prisma.TenderMatchOrderByWithRelationInput[] {
  if (sort === "deadline") return [{ tender: { deadline: "asc" } }];
  if (sort === "new") return [{ tender: { publishedAt: "desc" } }];
  if (feedMode === "profile") {
    return [{ relevanceScore: "desc" }, { feedScore: "desc" }];
  }
  return [{ feedScore: "desc" }, { forecastChance: "desc" }];
}

export function buildCatalogOrderBy(sort: FeedSortMode): Prisma.TenderOrderByWithRelationInput {
  if (sort === "deadline") return { deadline: "asc" };
  if (sort === "new") return { publishedAt: "desc" };
  return { publishedAt: "desc" };
}

export function matchesFeedKeywords(
  title: string,
  filters: TenderFeedFilters
): boolean {
  const t = title.toLowerCase();
  if (filters.includeWords.length > 0 && !filters.includeWords.some((w) => t.includes(w))) {
    return false;
  }
  if (filters.excludeWords.some((w) => t.includes(w))) return false;
  return true;
}

export function isTenderDeadlineVisible(
  deadline: Date,
  filters: TenderFeedFilters,
  allowExpired: boolean
): boolean {
  if (allowExpired) return true;
  const now = Date.now();
  const d = deadline.getTime();
  switch (filters.deadline) {
    case "active":
      return d >= now;
    case "1d":
      return d >= now && d <= now + 86400000;
    case "3d":
      return d >= now && d <= now + 3 * 86400000;
    case "7d":
      return d >= now && d <= now + 7 * 86400000;
    default:
      return d >= now;
  }
}

export function feedFiltersActive(filters: TenderFeedFilters): boolean {
  return (
    filters.sort !== DEFAULT_FEED_FILTERS.sort ||
    filters.deadline !== DEFAULT_FEED_FILTERS.deadline ||
    filters.includeWords.length > 0 ||
    filters.excludeWords.length > 0 ||
    filters.priceMin != null ||
    filters.priceMax != null
  );
}

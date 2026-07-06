/**
 * Лента тендеров: первая страница (SSR) и подгрузка при скролле (API).
 */

import type { Document } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCompanyDocuments } from "@/lib/matching";
import { buildCompanyFocus } from "@/lib/companyFocus";
import { filterTendersForVertical } from "@/lib/productVertical";
import {
  countActiveEisTenders,
  fetchTendersForFeed,
  REAL_EIS_TENDER_WHERE,
  TENDER_FEED_PAGE_SIZE,
  TENDER_FEED_SCAN_BATCH,
  TENDER_FEED_SELECT,
} from "@/lib/tenderQuery";
import {
  listAllTaggedTenderIds,
  listTenderIdsByLabel,
  listTenderLabelAssignmentsForTenders,
} from "@/lib/tenderLabels";
import {
  rankAndFilterTendersForFeed,
  type RankedTender,
  type TenderFeedMode,
} from "@/lib/tenderRanking";
import {
  computeCatalogHashFromDocuments,
  ensureCompanyFeedCache,
  getCompanyFeedCacheStatus,
  isFeedCacheRebuildActive,
  rerankTenderForCompanyCache,
} from "@/lib/tenderFeedCache";
import { createPerfTimer } from "@/lib/perfLog";
import {
  buildCachedMatchOrderBy,
  buildFeedTenderWhere,
  DEFAULT_FEED_FILTERS,
  type TenderFeedFilters,
} from "@/lib/tenderFeedFilters";
import type {
  PageFeedMode,
  TenderFeedCardItem,
  TenderFeedPageResult,
} from "@/lib/tenderFeedTypes";

export type { PageFeedMode, TenderFeedCardItem, TenderFeedPageResult } from "@/lib/tenderFeedTypes";

type FeedRow = {
  id: string;
  externalId: string;
  title: string;
  customerName: string;
  region: string;
  category: string;
  price: number;
  publishedAt: Date;
  deadline: Date;
  okvedCode: string | null;
  requirements: string;
};

interface FeedContext {
  okvedCodes: string[];
  documents: Document[];
  companyProfile: {
    okvedCodes: string[];
    revenue: number | null;
    region: string | null;
    description: string | null;
  };
  companyFocus: ReturnType<typeof buildCompanyFocus>;
  hasCatalog: boolean;
  companyId?: string;
  filters: TenderFeedFilters;
}

function matchRowToCard(
  tender: FeedRow,
  match: {
    forecastChance: number;
    feedScore: number;
    ruMatched: number;
    ruPartial: number;
    ruTotal: number;
  },
  hasCatalog: boolean
): Omit<TenderFeedCardItem, "labelNames" | "labelColors"> {
  let isEis = false;
  let hasTzFile = false;
  try {
    const req = JSON.parse(String(tender.requirements));
    isEis = req.importedFromEis === true;
    hasTzFile = req.tzParsedFromFile === true;
  } catch {
    // ignore
  }
  return {
    id: tender.id,
    externalId: tender.externalId,
    title: tender.title,
    customerName: tender.customerName,
    region: tender.region,
    category: tender.category,
    price: tender.price,
    deadline: new Date(tender.deadline).toISOString(),
    displayScore: hasCatalog ? match.forecastChance : match.feedScore,
    hasCatalog,
    ruMatched: match.ruMatched,
    ruPartial: match.ruPartial,
    ruTotal: match.ruTotal,
    isEis,
    hasTzFile,
  };
}

function rankedToCard(t: RankedTender<FeedRow>, hasCatalog: boolean): Omit<TenderFeedCardItem, "labelNames" | "labelColors"> {
  let isEis = false;
  let hasTzFile = false;
  try {
    const req = JSON.parse(String(t.requirements));
    isEis = req.importedFromEis === true;
    hasTzFile = req.tzParsedFromFile === true;
  } catch {
    // ignore
  }
  return {
    id: t.id!,
    externalId: t.externalId!,
    title: t.title!,
    customerName: t.customerName,
    region: t.region,
    category: t.category,
    price: t.price,
    deadline: new Date(t.deadline!).toISOString(),
    displayScore: hasCatalog ? t.forecastChance : t.matchScore,
    hasCatalog,
    ruMatched: t.ruMatched,
    ruPartial: t.ruPartial,
    ruTotal: t.ruTotal,
    isEis,
    hasTzFile,
  };
}

async function loadCachedFeedBatch(
  ctx: FeedContext,
  feedMode: "matched" | "profile",
  offset: number,
  limit: number
): Promise<TenderFeedPageResult> {
  const perf = createPerfTimer(`feed:${feedMode}:cached`);
  const companyId = ctx.companyId;
  const tenderWhere = buildFeedTenderWhere(ctx.filters, { allowExpired: false });
  const totalInDb = await countActiveEisTenders(prisma, tenderWhere);
  perf.step("countActiveEisTenders", { totalInDb });

  if (!companyId) {
    perf.end("fallback → filtered (нет companyId)");
    return loadFilteredBatch(ctx, feedMode, offset, limit);
  }

  const catalogHash = computeCatalogHashFromDocuments(
    {
      description: ctx.companyProfile.description,
      okvedCodes: JSON.stringify(ctx.companyProfile.okvedCodes),
    },
    ctx.documents
  );

  const cacheStatus = await getCompanyFeedCacheStatus(companyId, catalogHash);
  perf.step("getCompanyFeedCacheStatus", {
    count: cacheStatus.count,
    matched: cacheStatus.matchedCount,
    stale: cacheStatus.stale,
    rebuilding: cacheStatus.rebuilding,
  });
  void ensureCompanyFeedCache(companyId, catalogHash);

  if (
    cacheStatus.count === 0 &&
    (cacheStatus.rebuilding || isFeedCacheRebuildActive(companyId))
  ) {
    perf.end("ожидание кэша (rebuild)");
    return {
      items: [],
      nextOffset: 0,
      hasMore: false,
      totalInDb,
      statsShown: 0,
      cacheBuilding: true,
      cacheMatchedCount: 0,
    };
  }

  if (cacheStatus.count === 0) {
    perf.end("ожидание кэша (пустой)");
    return {
      items: [],
      nextOffset: 0,
      hasMore: false,
      totalInDb,
      statsShown: 0,
      cacheBuilding: true,
      cacheMatchedCount: 0,
    };
  }

  const where =
    feedMode === "matched"
      ? {
          companyId,
          showInFeed: true,
          tender: tenderWhere,
        }
      : {
          companyId,
          showInProfile: true,
          tender: tenderWhere,
        };

  const orderBy = buildCachedMatchOrderBy(feedMode, ctx.filters.sort);

  const [poolTotal, rows] = await Promise.all([
    prisma.tenderMatch.count({ where }),
    prisma.tenderMatch.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      include: { tender: { select: TENDER_FEED_SELECT } },
    }),
  ]);
  perf.step("tenderMatch query", { poolTotal, rows: rows.length, offset, limit });

  const cardRows: Omit<TenderFeedCardItem, "labelNames" | "labelColors">[] = [];
  for (const row of rows) {
    const tender = row.tender as FeedRow & { updatedAt?: Date };
    const stale =
      companyId &&
      (!row.computedAt || (tender.updatedAt && tender.updatedAt > row.computedAt));
    if (stale && companyId) {
      const fresh = await rerankTenderForCompanyCache(companyId, { ...tender, id: tender.id });
      if (fresh) {
        cardRows.push(
          matchRowToCard(
            tender,
            {
              feedScore: fresh.feedScore,
              forecastChance: fresh.forecastChance,
              ruMatched: fresh.ruMatched,
              ruPartial: fresh.ruPartial,
              ruTotal: fresh.ruTotal,
            },
            ctx.hasCatalog
          )
        );
        continue;
      }
    }
    cardRows.push(matchRowToCard(tender, row, ctx.hasCatalog));
  }

  const cards = await attachLabels(companyId, cardRows);
  perf.step("attachLabels", { cards: cards.length });

  const nextOffset = offset + rows.length;
  perf.end("готово", { poolTotal, hasMore: nextOffset < poolTotal });
  return {
    items: cards,
    nextOffset,
    hasMore: nextOffset < poolTotal,
    totalInDb,
    statsShown: poolTotal,
    cacheBuilding: cacheStatus.rebuilding && poolTotal === 0,
    cacheMatchedCount: feedMode === "matched" ? poolTotal : cacheStatus.matchedCount,
  };
}


async function attachLabels(
  companyId: string | undefined,
  cards: Omit<TenderFeedCardItem, "labelNames" | "labelColors">[]
): Promise<TenderFeedCardItem[]> {
  if (!companyId || cards.length === 0) {
    return cards.map((c) => ({ ...c, labelNames: [], labelColors: [] }));
  }
  const map = await listTenderLabelAssignmentsForTenders(
    companyId,
    cards.map((c) => c.id)
  );
  return cards.map((c) => {
    const labels = map.get(c.id);
    return {
      ...c,
      labelNames: labels?.names ?? [],
      labelColors: labels?.colors ?? [],
    };
  });
}

function buildContext(
  okvedCodes: string[],
  documents: Document[],
  company: { revenue: number | null; region: string | null; description: string | null } | null,
  filters: TenderFeedFilters = DEFAULT_FEED_FILTERS
): FeedContext {
  const catalogProducts = mapCompanyDocuments(documents)
    .filter((d) => d.isRelevant && d.products?.length)
    .flatMap((d) => d.products || []);
  return {
    okvedCodes,
    documents,
    companyProfile: {
      okvedCodes,
      revenue: company?.revenue ?? null,
      region: company?.region ?? null,
      description: company?.description ?? null,
    },
    companyFocus: buildCompanyFocus({
      description: company?.description ?? null,
      catalogProducts,
    }),
    hasCatalog: catalogProducts.length > 0,
    filters,
  };
}

function rankModeFor(feedMode: PageFeedMode, tagId?: string): TenderFeedMode {
  return feedMode === "tagged" || tagId ? "catalog" : (feedMode as TenderFeedMode);
}

async function loadTaggedBatch(
  ctx: FeedContext,
  feedMode: PageFeedMode,
  tagId: string | undefined,
  offset: number,
  limit: number
): Promise<TenderFeedPageResult> {
  const companyId = ctx.companyId;
  let ids: string[] = [];
  if (companyId && tagId) {
    ids = await listTenderIdsByLabel(companyId, tagId);
  } else if (companyId && feedMode === "tagged") {
    ids = await listAllTaggedTenderIds(companyId);
  }

  if (ids.length === 0) {
    const totalInDb = await countActiveEisTenders(prisma);
    return { items: [], nextOffset: offset, hasMore: false, totalInDb, statsShown: 0, taggedTotal: 0 };
  }

  const tenderWhere = buildFeedTenderWhere(ctx.filters, { allowExpired: true });
  const orderBy =
    ctx.filters.sort === "new"
      ? { publishedAt: "desc" as const }
      : { deadline: "asc" as const };

  const [poolTotal, rows] = await Promise.all([
    prisma.tender.count({ where: { id: { in: ids }, ...tenderWhere } }),
    prisma.tender.findMany({
      where: { id: { in: ids }, ...tenderWhere },
      select: TENDER_FEED_SELECT,
      orderBy,
      skip: offset,
      take: limit,
    }),
  ]);

  // Помеченные вручную — не отсекаем вертикальным фильтром (мед/фарм)
  const { tenders } = rankAndFilterTendersForFeed(
    rows,
    ctx.companyFocus,
    ctx.documents,
    ctx.companyProfile,
    { mode: "catalog", light: true }
  );

  const cards = await attachLabels(
    companyId,
    tenders.map((t) => rankedToCard(t, ctx.hasCatalog))
  );

  const nextOffset = offset + rows.length;
  return {
    items: cards,
    nextOffset,
    hasMore: nextOffset < poolTotal,
    totalInDb: await countActiveEisTenders(prisma),
    statsShown: cards.length,
    taggedTotal: poolTotal,
  };
}

async function loadCatalogBatchLive(
  ctx: FeedContext,
  offset: number,
  limit: number,
  tenderWhere: ReturnType<typeof buildFeedTenderWhere>,
  totalInDb: number
): Promise<TenderFeedPageResult> {
  const perf = createPerfTimer("feed:catalog:live");
  const rows = await fetchTendersForFeed(prisma, limit, offset, {
    where: tenderWhere,
    sort: ctx.filters.sort,
  });
  perf.step("fetchTendersForFeed", { rows: rows.length, totalInDb });

  if (rows.length === 0) {
    perf.end("пусто");
    return { items: [], nextOffset: offset, hasMore: false, totalInDb, statsShown: 0 };
  }

  const { tenders, stats } = rankAndFilterTendersForFeed(
    filterTendersForVertical(rows, ctx.okvedCodes),
    ctx.companyFocus,
    ctx.documents,
    ctx.companyProfile,
    { mode: "catalog", light: true }
  );
  perf.step("rankAndFilter", { shown: stats.shown, hiddenNoRu: stats.hiddenNoRu });

  const cards = await attachLabels(
    ctx.companyId,
    tenders.map((t) => rankedToCard(t, ctx.hasCatalog))
  );

  const nextOffset = offset + rows.length;
  perf.end("готово", { items: cards.length });
  return {
    items: cards,
    nextOffset,
    hasMore: nextOffset < totalInDb,
    totalInDb,
    statsShown: stats.shown,
  };
}

/** Каталог из TenderMatch — без live rankAndFilter (~90ms × 40 на каждый запрос) */
async function loadCatalogBatch(
  ctx: FeedContext,
  offset: number,
  limit: number
): Promise<TenderFeedPageResult> {
  const perf = createPerfTimer("feed:catalog:cached");
  const tenderWhere = buildFeedTenderWhere(ctx.filters, { allowExpired: false });
  const totalInDb = await countActiveEisTenders(prisma, tenderWhere);
  perf.step("countActiveEisTenders", { totalInDb });

  const companyId = ctx.companyId;
  if (!companyId) {
    perf.end("fallback live");
    return loadCatalogBatchLive(ctx, offset, limit, tenderWhere, totalInDb);
  }

  const catalogHash = computeCatalogHashFromDocuments(
    {
      description: ctx.companyProfile.description,
      okvedCodes: JSON.stringify(ctx.companyProfile.okvedCodes),
    },
    ctx.documents
  );

  const cacheStatus = await getCompanyFeedCacheStatus(companyId, catalogHash);
  perf.step("getCompanyFeedCacheStatus", {
    count: cacheStatus.count,
    stale: cacheStatus.stale,
    rebuilding: cacheStatus.rebuilding,
  });
  void ensureCompanyFeedCache(companyId, catalogHash);

  if (
    cacheStatus.count === 0 &&
    (cacheStatus.rebuilding || isFeedCacheRebuildActive(companyId))
  ) {
    perf.end("ожидание кэша");
    return {
      items: [],
      nextOffset: 0,
      hasMore: false,
      totalInDb,
      statsShown: 0,
      cacheBuilding: true,
    };
  }

  if (cacheStatus.count === 0) {
    perf.end("fallback live (пустой кэш)");
    return loadCatalogBatchLive(ctx, offset, limit, tenderWhere, totalInDb);
  }

  const where = {
    companyId,
    tender: tenderWhere,
  };
  const orderBy = buildCachedMatchOrderBy("catalog", ctx.filters.sort);

  const [poolTotal, rows] = await Promise.all([
    prisma.tenderMatch.count({ where }),
    prisma.tenderMatch.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      include: { tender: { select: TENDER_FEED_SELECT } },
    }),
  ]);
  perf.step("tenderMatch query", { poolTotal, rows: rows.length, offset, limit });

  const cards = await attachLabels(
    companyId,
    rows.map((row) => matchRowToCard(row.tender, row, ctx.hasCatalog))
  );
  perf.step("attachLabels", { cards: cards.length });

  const nextOffset = offset + rows.length;
  perf.end("готово", { poolTotal, hasMore: nextOffset < poolTotal });
  return {
    items: cards,
    nextOffset,
    hasMore: nextOffset < poolTotal,
    totalInDb,
    statsShown: poolTotal,
    cacheBuilding: cacheStatus.rebuilding && poolTotal === 0,
  };
}

async function loadFilteredBatch(
  ctx: FeedContext,
  feedMode: PageFeedMode,
  dbOffset: number,
  limit: number
): Promise<TenderFeedPageResult> {
  const perf = createPerfTimer(`feed:${feedMode}:scan`);
  const mode = feedMode as TenderFeedMode;
  const tenderWhere = buildFeedTenderWhere(ctx.filters, { allowExpired: false });
  const totalInDb = await countActiveEisTenders(prisma, tenderWhere);
  perf.step("countActiveEisTenders", { totalInDb });
  const collected: RankedTender<FeedRow>[] = [];
  let scanAt = dbOffset;
  let statsShown = 0;
  let statsHiddenNoRu = 0;
  let batchN = 0;

  while (collected.length < limit && scanAt < totalInDb) {
    batchN += 1;
    const batchStart = performance.now();
    const rows = await fetchTendersForFeed(prisma, TENDER_FEED_SCAN_BATCH, scanAt, {
      where: tenderWhere,
      sort: ctx.filters.sort,
    });
    if (rows.length === 0) break;

    const { tenders, stats } = rankAndFilterTendersForFeed(
      filterTendersForVertical(rows, ctx.okvedCodes),
      ctx.companyFocus,
      ctx.documents,
      ctx.companyProfile,
      { mode, light: true }
    );

    statsShown += stats.shown;
    statsHiddenNoRu += stats.hiddenNoRu;

    for (const t of tenders) {
      if (collected.length >= limit) break;
      collected.push(t);
    }

    scanAt += rows.length;
    perf.step(`scan batch #${batchN}`, {
      ms: Math.round(performance.now() - batchStart),
      scanned: scanAt,
      collected: collected.length,
    });
  }

  const cards = await attachLabels(
    ctx.companyId,
    collected.map((t) => rankedToCard(t, ctx.hasCatalog))
  );
  perf.end("готово", { batches: batchN, items: cards.length, statsShown, statsHiddenNoRu });

  return {
    items: cards,
    nextOffset: scanAt,
    hasMore: scanAt < totalInDb,
    totalInDb,
    statsShown,
    statsHiddenNoRu,
  };
}

async function loadSearchBatch(
  ctx: FeedContext,
  feedMode: PageFeedMode,
  searchQuery: string,
  limit: number
): Promise<TenderFeedPageResult> {
  const digitsOnly = searchQuery.replace(/\D/g, "");
  const isRegNumberSearch = digitsOnly.length >= 10;
  const tenderWhere = buildFeedTenderWhere(ctx.filters, {
    allowExpired: feedMode === "tagged",
  });
  const totalInDb = await countActiveEisTenders(prisma, tenderWhere);

  if (isRegNumberSearch) {
    const direct = await prisma.tender.findFirst({
      where: { ...tenderWhere, externalId: { contains: digitsOnly } },
      select: TENDER_FEED_SELECT,
    });
    if (!direct) {
      return { items: [], nextOffset: 0, hasMore: false, totalInDb, statsShown: 0 };
    }
    const { tenders } = rankAndFilterTendersForFeed(
      [direct],
      ctx.companyFocus,
      ctx.documents,
      ctx.companyProfile,
      { mode: "catalog", light: true }
    );
    const cards = await attachLabels(
      ctx.companyId,
      tenders.map((t) => rankedToCard(t, ctx.hasCatalog))
    );
    return { items: cards, nextOffset: 1, hasMore: false, totalInDb, statsShown: cards.length };
  }

  const qLower = searchQuery.toLowerCase();
  const all = await fetchTendersForFeed(prisma, Math.min(totalInDb, 2000), 0, {
    where: tenderWhere,
    sort: ctx.filters.sort,
  });
  const filtered = filterTendersForVertical(all, ctx.okvedCodes).filter(
    (t) =>
      t.title.toLowerCase().includes(qLower) ||
      t.customerName.toLowerCase().includes(qLower) ||
      t.externalId.includes(digitsOnly || searchQuery)
  );

  const { tenders } = rankAndFilterTendersForFeed(
    filtered.slice(0, limit),
    ctx.companyFocus,
    ctx.documents,
    ctx.companyProfile,
    { mode: rankModeFor(feedMode), light: true }
  );

  const cards = await attachLabels(
    ctx.companyId,
    tenders.map((t) => rankedToCard(t, ctx.hasCatalog))
  );

  return {
    items: cards,
    nextOffset: cards.length,
    hasMore: false,
    totalInDb,
    statsShown: cards.length,
  };
}

export async function loadTenderFeedPage(options: {
  okvedCodes: string[];
  documents: Document[];
  company: { id?: string; revenue: number | null; region: string | null; description: string | null } | null;
  feedMode: PageFeedMode;
  tagId?: string;
  searchQuery?: string;
  offset?: number;
  limit?: number;
  filters?: TenderFeedFilters;
}): Promise<TenderFeedPageResult> {
  const perf = createPerfTimer(
    `loadTenderFeedPage(${options.feedMode}${options.searchQuery ? ",q" : ""})`
  );
  const filters = options.filters ?? DEFAULT_FEED_FILTERS;
  const ctx = buildContext(options.okvedCodes, options.documents, options.company, filters);
  ctx.companyId = options.company?.id;
  perf.step("buildContext", { hasCatalog: ctx.hasCatalog, filters: filters.deadline });

  const offset = options.offset ?? 0;
  const limit = options.limit ?? TENDER_FEED_PAGE_SIZE;
  const searchQuery = (options.searchQuery || "").trim();

  let result: TenderFeedPageResult;
  if (searchQuery.length >= 2) {
    result = await loadSearchBatch(ctx, options.feedMode, searchQuery, limit);
  } else if (options.feedMode === "tagged") {
    result = await loadTaggedBatch(ctx, options.feedMode, options.tagId, offset, limit);
  } else if (options.feedMode === "catalog") {
    result = await loadCatalogBatch(ctx, offset, limit);
  } else {
    result = await loadCachedFeedBatch(ctx, options.feedMode as "matched" | "profile", offset, limit);
  }

  perf.end("итого", {
    items: result.items.length,
    offset,
    hasMore: result.hasMore,
    cacheBuilding: result.cacheBuilding ?? false,
  });
  return result;
}

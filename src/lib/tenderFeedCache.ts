/**
 * Кэш ранжирования ленты: companyId × tenderId → feedScore, showInFeed, ruMatched…
 * Считается в фоне; лента matched/profile читает из TenderMatch.
 */

import { createHash } from "crypto";
import type { Document, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCompanyFocus } from "@/lib/companyFocus";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "@/lib/catalogProductSync";
import { mapCompanyDocuments } from "@/lib/matching";
import { filterTendersForVertical } from "@/lib/productVertical";
import {
  fetchTendersForFeed,
  REAL_EIS_TENDER_WHERE,
  TENDER_FEED_SELECT,
} from "@/lib/tenderQuery";
import {
  rankTenderForFeed,
  type TenderFeedRank,
  type TenderRankInput,
} from "@/lib/tenderRanking";
import { perfLog } from "@/lib/perfLog";
import { backgroundJobsInNext } from "@/lib/runtimeConfig";
import { enqueueFeedCacheJob, type FeedCacheJob } from "@/lib/feedCacheJobQueue";

const REBUILD_BATCH = 500;
const PARTIAL_REBUILD_DEBOUNCE_MS = 5_000;
const PARTIAL_REBUILD_MAX_BATCH = 100;
const PARTIAL_REBUILD_GAP_MS = 1_500;
const PARTIAL_LOG_MIN = 25;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const rebuildLocks = new Set<string>();
const rebuildStateByCompany = new Map<string, FeedCacheRebuildState>();
/** Накопление ID при занятом lock — не теряем обновления */
const pendingPartialByCompany = new Map<string, Set<string>>();
const pendingFullRebuildCompanies = new Set<string>();
/** Глобальная очередь после sync / enrich — один flush на все компании */
const pendingTenderIdsGlobal = new Set<string>();
let globalFlushTimer: ReturnType<typeof setTimeout> | null = null;
/** Одна цепочка stale-rebuild на компанию — не запускать 20 пачек подряд в одном тике */
const staleRebuildQueued = new Set<string>();

export interface CompanyFeedCacheStatus {
  count: number;
  matchedCount: number;
  profileCount: number;
  catalogHash: string;
  stale: boolean;
  rebuilding: boolean;
  rebuildProcessed: number;
  rebuildTotal: number;
  rebuildMessage: string;
}

export interface FeedCacheRebuildState {
  running: boolean;
  companyId?: string;
  processed: number;
  total: number;
  lastMessage: string;
  startedAt?: string;
  finishedAt?: string;
}

export function isFeedCacheRebuildActive(companyId: string): boolean {
  return rebuildLocks.has(companyId);
}

function computeShowInProfile(rank: TenderFeedRank): boolean {
  if (rank.relevanceScore < 15) return false;
  if (
    rank.hideReason?.match(/не ваша номенклатура|другой вид изделий|не совпадает с профилем/i)
  ) {
    return false;
  }
  return true;
}

export function computeCatalogHash(input: {
  companyDescription: string | null;
  okvedCodes: string[];
  documents: Array<{ id: string; status: string; extractedData: string }>;
  catalogProductCount: number;
}): string {
  const payload = {
    description: input.companyDescription ?? "",
    okved: [...input.okvedCodes].sort(),
    docs: input.documents
      .map((d) => `${d.id}:${d.status}:${d.extractedData.length}`)
      .sort(),
    catalogProducts: input.catalogProductCount,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

async function loadCompanyRankingContext(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { documents: true },
  });
  if (!company) return null;

  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(company.okvedCodes || "[]");
  } catch {
    okvedCodes = [];
  }

  const catalogRows = await loadCompanyCatalogProducts(companyId);
  const docsForMatching = mapCompanyDocuments(company.documents);
  const mergedCatalog = mergeCompanyCatalogSources({ catalogRows, docsForMatching });
  const catalogStructured = mergedCatalog.catalogStructured;
  const catalogProducts = mergedCatalog.catalogProducts;

  const docsWithCatalog = docsForMatching;

  const catalogHash = computeCatalogHash({
    companyDescription: company.description,
    okvedCodes,
    documents: company.documents,
    catalogProductCount: catalogProducts.length,
  });

  const companyProfile = {
    okvedCodes,
    revenue: company.revenue,
    region: company.region,
    description: company.description,
  };

  const focus = buildCompanyFocus({
    description: company.description,
    catalogProducts: docsForMatching
      .filter((d) => d.isRelevant && d.products?.length)
      .flatMap((d) => d.products || []),
  });

  return {
    company,
    okvedCodes,
    documents: company.documents,
    catalogProducts,
    catalogStructured,
    docsWithCatalog,
    catalogHash,
    companyProfile,
    focus,
    hasCatalog: catalogProducts.length > 0,
  };
}

export function upsertPayloadFromRank(rank: TenderFeedRank, catalogHash?: string) {
  const base = {
    matchScore: rank.feedScore,
    feedScore: rank.feedScore,
    showInFeed: rank.showInFeed,
    showInProfile: computeShowInProfile(rank),
    ruMatched: rank.ruMatched,
    ruPartial: rank.ruPartial,
    ruTotal: rank.ruTotal,
    forecastChance: rank.forecastChance,
    relevanceScore: rank.relevanceScore,
    hideReason: rank.hideReason ?? null,
    computedAt: new Date(),
  };
  if (catalogHash) {
    return { ...base, catalogHash };
  }
  return base;
}

export async function upsertTenderMatchRank(
  db: PrismaClient,
  companyId: string,
  tenderId: string,
  rank: TenderFeedRank,
  catalogHash?: string
) {
  const data = upsertPayloadFromRank(rank, catalogHash);
  await db.tenderMatch.upsert({
    where: { companyId_tenderId: { companyId, tenderId } },
    create: {
      companyId,
      tenderId,
      gaps: "[]",
      strengths: "[]",
      recommendation: rank.hideReason ? `Скрыт: ${rank.hideReason}` : null,
      status: "cached",
      catalogHash: catalogHash ?? null,
      ...data,
    },
    update: data,
  });
}

function rankTenderRow(
  tender: TenderRankInput & { id: string },
  ctx: NonNullable<Awaited<ReturnType<typeof loadCompanyRankingContext>>>
) {
  let parsedReqs: Record<string, unknown> = {};
  try {
    parsedReqs = JSON.parse(String(tender.requirements ?? "{}"));
  } catch {
    parsedReqs = {};
  }

  return rankTenderForFeed(
    tender,
    ctx.focus,
    ctx.catalogProducts,
    ctx.docsWithCatalog,
    ctx.companyProfile,
    { light: true, parsedReqs, catalogStructured: ctx.catalogStructured }
  );
}

async function processTenderBatch(
  companyId: string,
  tenders: Array<TenderRankInput & { id: string }>,
  ctx: NonNullable<Awaited<ReturnType<typeof loadCompanyRankingContext>>>
) {
  const vertical = filterTendersForVertical(
    tenders as Array<{ id: string; category: string; okvedCode?: string | null; title?: string; requirements?: string }>,
    ctx.okvedCodes
  );
  const verticalIds = new Set(vertical.map((t) => t.id));
  const CHUNK = 30;

  for (let i = 0; i < tenders.length; i += CHUNK) {
    const slice = tenders.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((tender) => {
        const rank = verticalIds.has(tender.id)
          ? rankTenderRow(tender, ctx)
          : ({
              feedScore: 0,
              relevanceScore: 0,
              matchScore: null,
              ruMatched: 0,
              ruPartial: 0,
              ruMissing: 0,
              ruTotal: 0,
              ruCoveragePercent: 0,
              forecastChance: 0,
              forecastLevel: "none" as const,
              showInFeed: false,
              hideReason: "вне вертикали",
              relevanceReason: "",
            } satisfies TenderFeedRank);

        const data = upsertPayloadFromRank(rank, ctx.catalogHash);
        return prisma.tenderMatch.upsert({
          where: { companyId_tenderId: { companyId, tenderId: tender.id } },
          create: {
            companyId,
            tenderId: tender.id,
            gaps: "[]",
            strengths: "[]",
            recommendation: rank.hideReason ? `Скрыт: ${rank.hideReason}` : null,
            status: "cached",
            catalogHash: ctx.catalogHash,
            ...data,
          },
          update: data,
        });
      })
    );
    if (i + CHUNK < tenders.length) {
      await yieldToEventLoop();
    }
  }
}

export function getFeedCacheRebuildState(companyId: string): FeedCacheRebuildState {
  return (
    rebuildStateByCompany.get(companyId) ?? {
      running: false,
      processed: 0,
      total: 0,
      lastMessage: "",
    }
  );
}

export async function getCompanyFeedCacheStatus(
  companyId: string,
  currentCatalogHash?: string
): Promise<CompanyFeedCacheStatus> {
  const rebuild = getFeedCacheRebuildState(companyId);
  const [count, matchedCount, profileCount, sample] = await Promise.all([
    prisma.tenderMatch.count({ where: { companyId } }),
    prisma.tenderMatch.count({ where: { companyId, showInFeed: true } }),
    prisma.tenderMatch.count({ where: { companyId, showInProfile: true } }),
    prisma.tenderMatch.findFirst({
      where: { companyId },
      select: { catalogHash: true },
      orderBy: { computedAt: "desc" },
    }),
  ]);

  const catalogHash = currentCatalogHash ?? sample?.catalogHash ?? "";
  const stale =
    count > 0 && !!catalogHash && sample?.catalogHash != null && sample.catalogHash !== catalogHash;

  return {
    count,
    matchedCount,
    profileCount,
    catalogHash,
    stale,
    rebuilding: rebuild.running,
    rebuildProcessed: rebuild.processed,
    rebuildTotal: rebuild.total,
    rebuildMessage: rebuild.lastMessage,
  };
}

function mergePendingPartial(companyId: string, tenderIds: string[]) {
  const set = pendingPartialByCompany.get(companyId) ?? new Set<string>();
  for (const id of tenderIds) set.add(id);
  pendingPartialByCompany.set(companyId, set);
}

function drainPendingForCompany(companyId: string) {
  if (pendingFullRebuildCompanies.has(companyId)) {
    pendingFullRebuildCompanies.delete(companyId);
    setTimeout(() => scheduleCompanyFeedCacheRebuild(companyId, { full: true }), PARTIAL_REBUILD_GAP_MS);
    return;
  }
  const pending = pendingPartialByCompany.get(companyId);
  if (pending && pending.size > 0) {
    const ids = [...pending];
    pending.clear();
    setTimeout(() => scheduleCompanyFeedCacheRebuild(companyId, { tenderIds: ids }), PARTIAL_REBUILD_GAP_MS);
  }
}

/** Накопить ID и обновить кэш пачкой (после sync / enrich), без спама по 1 тендеру */
export function queueTenderFeedCacheUpdate(tenderIds: string[]) {
  let added = 0;
  for (const id of tenderIds) {
    if (id && !pendingTenderIdsGlobal.has(id)) {
      pendingTenderIdsGlobal.add(id);
      added++;
    }
  }
  if (added === 0 && !globalFlushTimer) return;
  if (globalFlushTimer) clearTimeout(globalFlushTimer);
  globalFlushTimer = setTimeout(() => void flushGlobalTenderFeedQueue(), PARTIAL_REBUILD_DEBOUNCE_MS);
}

async function flushGlobalTenderFeedQueue() {
  globalFlushTimer = null;
  if (pendingTenderIdsGlobal.size === 0) return;

  const batch = [...pendingTenderIdsGlobal].slice(0, PARTIAL_REBUILD_MAX_BATCH);
  for (const id of batch) pendingTenderIdsGlobal.delete(id);

  if (!backgroundJobsInNext()) {
    void enqueueFeedCacheJob({ type: "global", tenderIds: batch });
  } else {
    await rebuildTendersForAllCompaniesImmediate(batch);
  }

  if (pendingTenderIdsGlobal.size > 0) {
    globalFlushTimer = setTimeout(() => void flushGlobalTenderFeedQueue(), PARTIAL_REBUILD_DEBOUNCE_MS);
  }
}

async function rebuildTendersForAllCompaniesImmediate(tenderIds: string[]) {
  if (tenderIds.length === 0) return;
  const companies = await prisma.company.findMany({
    where: { documents: { some: {} } },
    select: { id: true },
  });
  for (const { id } of companies) {
    scheduleCompanyFeedCacheRebuild(id, { tenderIds });
  }
}

export async function rebuildCompanyFeedCache(
  companyId: string,
  options: { tenderIds?: string[]; full?: boolean } = {}
): Promise<{ processed: number }> {
  if (rebuildLocks.has(companyId)) {
    if (options.full) pendingFullRebuildCompanies.add(companyId);
    else if (options.tenderIds?.length) mergePendingPartial(companyId, options.tenderIds);
    return { processed: 0 };
  }

  rebuildLocks.add(companyId);
  const state: FeedCacheRebuildState = {
    running: true,
    companyId,
    processed: 0,
    total: 0,
    lastMessage: "Подготовка…",
    startedAt: new Date().toISOString(),
  };
  rebuildStateByCompany.set(companyId, state);

  try {
    const ctx = await loadCompanyRankingContext(companyId);
    if (!ctx) return { processed: 0 };

    const tenderIds = options.tenderIds?.filter(Boolean);
    let processed = 0;
    const rebuildStarted = performance.now();

    if (tenderIds && tenderIds.length > 0) {
      state.total = tenderIds.length;
      state.lastMessage = `Обновление ${tenderIds.length} закупок…`;

      const tenders = await prisma.tender.findMany({
        where: { id: { in: tenderIds }, ...REAL_EIS_TENDER_WHERE },
        select: { ...TENDER_FEED_SELECT, id: true },
      });

      await processTenderBatch(companyId, tenders, ctx);
      processed = tenders.length;
      state.processed = processed;
      state.lastMessage = `Обновлено ${processed} закупок`;
      if (processed >= PARTIAL_LOG_MIN) {
        perfLog("feed-cache", `partial rebuild ${companyId.slice(0, 8)}`, {
          ms: Math.round(performance.now() - rebuildStarted),
          processed,
        });
      }
      return { processed };
    }

    const totalInDb = await prisma.tender.count({ where: REAL_EIS_TENDER_WHERE });
    state.total = totalInDb;
    state.lastMessage = `Считаем совпадения: 0 / ${totalInDb}`;
    perfLog("feed-cache", `full rebuild start ${companyId.slice(0, 8)}`, { totalInDb });

    let skip = 0;
    let batchN = 0;
    while (skip < totalInDb) {
      const batchStart = performance.now();
      const batch = await fetchTendersForFeed(prisma, REBUILD_BATCH, skip);
      if (batch.length === 0) break;

      await processTenderBatch(companyId, batch, ctx);
      skip += batch.length;
      processed += batch.length;
      batchN += 1;
      state.processed = processed;
      state.lastMessage = `Считаем совпадения: ${processed} / ${totalInDb}`;

      if (batchN === 1 || batchN % 5 === 0 || skip >= totalInDb) {
        perfLog("feed-cache", `batch #${batchN}`, {
          ms: Math.round(performance.now() - batchStart),
          processed,
          totalInDb,
          pct: Math.round((processed / totalInDb) * 100),
        });
      }
    }

    state.lastMessage = `Готово: ${processed} закупок`;
    perfLog("feed-cache", `full rebuild done ${companyId.slice(0, 8)}`, {
      ms: Math.round(performance.now() - rebuildStarted),
      processed,
      batches: batchN,
    });
    return { processed };
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    rebuildStateByCompany.set(companyId, state);
    rebuildLocks.delete(companyId);
    drainPendingForCompany(companyId);
  }
}

export function scheduleCompanyFeedCacheRebuild(
  companyId: string,
  options: { tenderIds?: string[]; full?: boolean } = {}
) {
  if (!backgroundJobsInNext()) {
    void enqueueFeedCacheJob({
      type: "rebuild",
      companyId,
      full: options.full,
      tenderIds: options.tenderIds?.length ? options.tenderIds : undefined,
    });
    return;
  }

  if (rebuildLocks.has(companyId)) {
    if (options.full) pendingFullRebuildCompanies.add(companyId);
    else if (options.tenderIds?.length) mergePendingPartial(companyId, options.tenderIds);
    return;
  }
  setTimeout(() => {
    void rebuildCompanyFeedCache(companyId, options).catch((e) => {
      console.error(`[feed-cache] rebuild failed for ${companyId}:`, e);
    });
  }, 0);
}

export async function ensureCompanyFeedCache(companyId: string, catalogHash?: string) {
  const status = await getCompanyFeedCacheStatus(companyId, catalogHash);
  if (status.rebuilding) return status;

  if (status.count === 0) {
    scheduleCompanyFeedCacheRebuild(companyId, { full: true });
    return status;
  }

  if (status.stale && catalogHash) {
    scheduleStaleFeedMatchRebuild(companyId, catalogHash);
  }

  return status;
}

function scheduleStaleFeedMatchRebuild(companyId: string, catalogHash: string) {
  if (!backgroundJobsInNext()) {
    void enqueueFeedCacheJob({ type: "stale", companyId, catalogHash });
    return;
  }
  if (staleRebuildQueued.has(companyId) || rebuildLocks.has(companyId)) return;
  staleRebuildQueued.add(companyId);
  setTimeout(() => {
    staleRebuildQueued.delete(companyId);
    void rebuildStaleFeedMatches(companyId, catalogHash).catch((e) => {
      console.error(`[feed-cache] stale partial failed for ${companyId}:`, e);
    });
  }, 300);
}

/** Пересчёт устаревших строк — по одной пачке с паузой, чтобы не блокировать dev-сервер */
async function rebuildStaleFeedMatches(companyId: string, catalogHash: string) {
  if (rebuildLocks.has(companyId)) {
    scheduleStaleFeedMatchRebuild(companyId, catalogHash);
    return;
  }

  const staleWhere = {
    companyId,
    OR: [{ catalogHash: { not: catalogHash } }, { catalogHash: null }],
  };

  const staleRows = await prisma.tenderMatch.findMany({
    where: staleWhere,
    select: { tenderId: true },
    take: PARTIAL_REBUILD_MAX_BATCH,
  });

  if (staleRows.length > 0) {
    await rebuildCompanyFeedCache(companyId, {
      tenderIds: staleRows.map((r) => r.tenderId),
    });
    const remaining = await prisma.tenderMatch.count({ where: staleWhere });
    if (remaining > 0) {
      setTimeout(
        () => void rebuildStaleFeedMatches(companyId, catalogHash),
        PARTIAL_REBUILD_GAP_MS
      );
    }
    return;
  }

  const missing = await prisma.tender.findMany({
    where: {
      ...REAL_EIS_TENDER_WHERE,
      matches: { none: { companyId } },
    },
    select: { id: true },
    take: PARTIAL_REBUILD_MAX_BATCH,
  });

  if (missing.length === 0) return;

  await rebuildCompanyFeedCache(companyId, {
    tenderIds: missing.map((m) => m.id),
  });
  setTimeout(() => void rebuildStaleFeedMatches(companyId, catalogHash), PARTIAL_REBUILD_GAP_MS);
}

export async function rebuildTendersForAllCompanies(tenderIds: string[]) {
  queueTenderFeedCacheUpdate(tenderIds);
}

/** Сразу пересчитать (после разбора ТЗ на карточке) — без 5 с debounce */
export function rebuildTendersForAllCompaniesNow(tenderIds: string[]) {
  const ids = tenderIds.filter(Boolean);
  if (ids.length === 0) return;
  if (!backgroundJobsInNext()) {
    void enqueueFeedCacheJob({ type: "global", tenderIds: ids });
    return;
  }
  void rebuildTendersForAllCompaniesImmediate(ids);
}

/** Выполнить задачу из очереди worker */
export async function processFeedCacheJob(job: FeedCacheJob): Promise<void> {
  if (job.type === "rebuild") {
    await rebuildCompanyFeedCache(job.companyId, {
      full: job.full,
      tenderIds: job.tenderIds,
    });
    return;
  }
  if (job.type === "stale") {
    await rebuildStaleFeedMatches(job.companyId, job.catalogHash);
    return;
  }
  if (job.type === "global") {
    await rebuildTendersForAllCompaniesImmediate(job.tenderIds);
  }
}

/** Свежий ранг, если тендер обновился после последнего кэша */
export async function rerankTenderForCompanyCache(
  companyId: string,
  tender: TenderRankInput & { id: string }
): Promise<TenderFeedRank | null> {
  const ctx = await loadCompanyRankingContext(companyId);
  if (!ctx) return null;
  const rank = rankTenderRow(tender, ctx);
  await upsertTenderMatchRank(prisma, companyId, tender.id, rank, ctx.catalogHash);
  return rank;
}

export function computeCatalogHashFromDocuments(
  company: { description: string | null; okvedCodes: string },
  documents: Document[]
): string {
  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(company.okvedCodes || "[]");
  } catch {
    okvedCodes = [];
  }
  const relevantCatalogCount = documents.reduce((n, d) => {
    try {
      const data = JSON.parse(d.extractedData || "{}");
      return n + (Array.isArray(data.catalogItems) ? data.catalogItems.length : 0);
    } catch {
      return n;
    }
  }, 0);
  return computeCatalogHash({
    companyDescription: company.description,
    okvedCodes,
    documents,
    catalogProductCount: relevantCatalogCount,
  });
}

/**
 * Запросы к БД: только реальные закупки, импортированные с zakupki.gov.ru.
 */

import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isDemoTenderExternalId } from "@/lib/zakupki";
import type { FeedSortMode } from "@/lib/tenderFeedFilters";
import { buildCatalogOrderBy } from "@/lib/tenderFeedFilters";
import { cacheGet, cacheSet, cacheDel } from "@/lib/appCache";
import {
  REAL_EIS_TENDER_WHERE,
  TENDER_FEED_SELECT,
  TENDER_RANK_POOL,
  TENDER_FEED_PAGE_SIZE,
  TENDER_FEED_SCAN_BATCH,
} from "@/lib/tenderConstants";

export {
  REAL_EIS_TENDER_WHERE,
  TENDER_FEED_SELECT,
  TENDER_RANK_POOL,
  TENDER_FEED_PAGE_SIZE,
  TENDER_FEED_SCAN_BATCH,
};

const COUNT_CACHE_TTL_SEC = 45;
const COUNT_CACHE_PREFIX = "tender:count:";

export async function fetchTendersForFeed(
  prisma: PrismaClient,
  limit: number,
  skip = 0,
  options?: {
    where?: Prisma.TenderWhereInput;
    sort?: FeedSortMode;
  }
) {
  return prisma.tender.findMany({
    where: options?.where ?? REAL_EIS_TENDER_WHERE,
    orderBy: buildCatalogOrderBy(options?.sort ?? "new"),
    skip,
    take: limit,
    select: TENDER_FEED_SELECT,
  });
}

export async function countActiveEisTenders(
  prisma: PrismaClient,
  where: Prisma.TenderWhereInput = REAL_EIS_TENDER_WHERE
) {
  return cachedTenderCount(prisma, where);
}

function countCacheKey(where: Prisma.TenderWhereInput): string {
  return COUNT_CACHE_PREFIX + JSON.stringify(where);
}

async function cachedTenderCount(prisma: PrismaClient, where: Prisma.TenderWhereInput) {
  const key = countCacheKey(where);
  const cached = await cacheGet(key);
  if (cached != null) {
    const n = parseInt(cached, 10);
    if (Number.isFinite(n)) return n;
  }
  const value = await prisma.tender.count({ where });
  await cacheSet(key, String(value), COUNT_CACHE_TTL_SEC);
  return value;
}

/** Сброс после синка / импорта */
export async function invalidateTenderCountCache(): Promise<void> {
  await cacheDel(countCacheKey(REAL_EIS_TENDER_WHERE));
}

export function isRealEisTender(
  requirementsJson: string,
  externalId: string,
  importedFromEis?: boolean
): boolean {
  if (isDemoTenderExternalId(externalId)) return false;
  if (importedFromEis === true) return true;
  if (importedFromEis === false) return false;
  try {
    const r = JSON.parse(requirementsJson);
    return r.importedFromEis === true && r.isDemo !== true;
  } catch {
    return false;
  }
}

/** Удаляет все тендеры, не загруженные с ЕИС */
export async function purgeNonEisTenders(prisma: PrismaClient): Promise<number> {
  const toDelete = await prisma.tender.findMany({
    where: { importedFromEis: false },
    select: { id: true },
  });

  if (toDelete.length === 0) return 0;

  const ids = toDelete.map((t) => t.id);
  await prisma.tenderMatch.deleteMany({ where: { tenderId: { in: ids } } });
  await prisma.tender.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

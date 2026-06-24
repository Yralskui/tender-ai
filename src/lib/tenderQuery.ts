/**
 * Запросы к БД: только реальные закупки, импортированные с zakupki.gov.ru.
 */

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isDemoTenderExternalId } from "@/lib/zakupki";
import type { FeedSortMode } from "@/lib/tenderFeedFilters";
import { buildCatalogOrderBy } from "@/lib/tenderFeedFilters";

export const REAL_EIS_TENDER_WHERE = {
  status: "active" as const,
  requirements: { contains: '"importedFromEis":true' },
};

/** Поля для ленты — без лишних колонок */
export const TENDER_FEED_SELECT = {
  id: true,
  externalId: true,
  title: true,
  customerName: true,
  region: true,
  price: true,
  publishedAt: true,
  deadline: true,
  category: true,
  okvedCode: true,
  requirements: true,
} as const;

/** Сколько последних закупок ранжируем (полный analyzeMatch только на карточке тендера) */
export const TENDER_RANK_POOL = {
  dashboard: 100,
  matched: 200,
  profile: 250,
  catalog: 200,
} as const;

/** Карточек на экран / за один запрос подгрузки */
export const TENDER_FEED_PAGE_SIZE = 40;

/** Сколько строк из БД читаем за один проход (matched/profile) */
export const TENDER_FEED_SCAN_BATCH = 300;

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
  return prisma.tender.count({ where });
}

export function isRealEisTender(requirementsJson: string, externalId: string): boolean {
  if (isDemoTenderExternalId(externalId)) return false;
  try {
    const r = JSON.parse(requirementsJson);
    return r.importedFromEis === true && r.isDemo !== true;
  } catch {
    return false;
  }
}

/** Удаляет все тендеры, не загруженные с ЕИС */
export async function purgeNonEisTenders(prisma: PrismaClient): Promise<number> {
  const all = await prisma.tender.findMany({
    select: { id: true, externalId: true, requirements: true },
  });

  const toDelete = all
    .filter((t) => !isRealEisTender(t.requirements, t.externalId))
    .map((t) => t.id);

  if (toDelete.length === 0) return 0;

  await prisma.tenderMatch.deleteMany({ where: { tenderId: { in: toDelete } } });
  await prisma.tender.deleteMany({ where: { id: { in: toDelete } } });
  return toDelete.length;
}

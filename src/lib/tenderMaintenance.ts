/**

 * Уборка базы: просроченные закупки и кэш файлов ТЗ на диске.

 * С меткой — храним бессрочно; без метки — удаляем сразу после дедлайна.

 */



import { rm, readdir } from "fs/promises";

import path from "path";

import type { PrismaClient } from "@/generated/prisma/client";



const TZ_CACHE_DIR = path.join(process.cwd(), "data", "tz-cache");



/** @deprecated Используется только в подписях sync; фактически удаляем без метки сразу */

export const EXPIRED_TENDER_GRACE_DAYS = 0;



export interface MaintenanceResult {

  expiredTendersDeleted: number;

  expiredCacheDirsRemoved: number;

  orphanCacheDirsRemoved: number;

  deletedExternalIds: string[];

}



export async function removeTzCacheDir(externalId: string): Promise<boolean> {

  const dir = path.join(TZ_CACHE_DIR, externalId);

  try {

    await rm(dir, { recursive: true, force: true });

    return true;

  } catch {

    return false;

  }

}



/** Удаляет просроченные закупки без меток (с меткой — остаются в базе) */

export async function purgeExpiredTenders(

  prisma: PrismaClient

): Promise<{ deleted: number; externalIds: string[] }> {

  const now = new Date();



  const expired = await prisma.tender.findMany({

    where: { deadline: { lt: now } },

    select: {

      id: true,

      externalId: true,

      _count: { select: { labelAssignments: true } },

    },

  });



  const toDelete = expired.filter((t) => t._count.labelAssignments === 0);

  if (toDelete.length === 0) {

    return { deleted: 0, externalIds: [] };

  }



  const ids = toDelete.map((t) => t.id);

  const externalIds = toDelete.map((t) => t.externalId);



  await prisma.tenderMatch.deleteMany({ where: { tenderId: { in: ids } } });

  await prisma.tender.deleteMany({ where: { id: { in: ids } } });



  for (const externalId of externalIds) {

    await removeTzCacheDir(externalId);

  }



  return { deleted: toDelete.length, externalIds };

}



/** Кэш-папки без записи в БД или просроченные без метки */

export async function purgeOrphanTzCache(prisma: PrismaClient): Promise<number> {

  let removed = 0;

  let entries: string[] = [];



  try {

    entries = await readdir(TZ_CACHE_DIR);

  } catch {

    return 0;

  }



  const now = new Date();

  const tenders = await prisma.tender.findMany({

    select: {

      externalId: true,

      deadline: true,

      _count: { select: { labelAssignments: true } },

    },

  });



  const keepCache = new Set(

    tenders

      .filter((t) => t.deadline >= now || t._count.labelAssignments > 0)

      .map((t) => t.externalId)

  );



  for (const entry of entries) {

    if (!/^\d{10,22}$/.test(entry)) continue;

    if (!keepCache.has(entry)) {

      if (await removeTzCacheDir(entry)) removed++;

    }

  }



  return removed;

}



export async function runTenderMaintenance(prisma: PrismaClient): Promise<MaintenanceResult> {

  const { deleted, externalIds } = await purgeExpiredTenders(prisma);

  const orphanCacheDirsRemoved = await purgeOrphanTzCache(prisma);



  return {

    expiredTendersDeleted: deleted,

    expiredCacheDirsRemoved: externalIds.length,

    orphanCacheDirsRemoved,

    deletedExternalIds: externalIds,

  };

}



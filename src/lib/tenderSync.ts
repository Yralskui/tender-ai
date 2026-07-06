/**
 * Синхронизация тендеров с zakupki.gov.ru — общая логика для UI и cron.
 */

import { prisma } from "@/lib/prisma";
import { importMedicalTendersFromEis } from "@/lib/zakupkiImport";
import { purgeNonEisTenders, REAL_EIS_TENDER_WHERE, invalidateTenderCountCache } from "@/lib/tenderQuery";
import { tenderRowFromRequirements } from "@/lib/tenderMeta";
import { runTenderMaintenance } from "@/lib/tenderMaintenance";
import { rebuildTendersForAllCompanies } from "@/lib/tenderFeedCache";
import { buildCompanyFocus, buildImportQueriesFromFocus } from "@/lib/companyFocus";
import { mapCompanyDocuments } from "@/lib/matching";
import { loadDocumentsForMatching } from "@/lib/documentQuery";
import type { CompanyFocus } from "@/lib/companyFocus";

export type SyncMode = "smart" | "catalog";

export interface SyncConfig {
  limit: number;
  recordsPerQuery: number;
  searchPages: number;
  concurrency: number;
  smartMode: boolean;
  fastImport: boolean;
  parseTzFiles: boolean;
  tzTopN: number;
}

export function resolveSyncConfig(mode: SyncMode, limitParam: number): SyncConfig {
  if (mode === "catalog") {
    return {
      limit: Math.min(Math.max(limitParam, 200), 2500),
      recordsPerQuery: 50,
      searchPages: 20,
      concurrency: 8,
      smartMode: false,
      fastImport: true,
      parseTzFiles: false,
      tzTopN: 0,
    };
  }
  return {
    limit: Math.min(Math.max(limitParam, 80), 320),
    recordsPerQuery: 50,
    searchPages: 10,
    concurrency: 6,
    smartMode: true,
    fastImport: false,
    parseTzFiles: false,
    tzTopN: 50,
  };
}

export interface RunTenderSyncOptions {
  mode?: SyncMode;
  limit?: number;
  companyFocus?: CompanyFocus | null;
  searchQueries?: ReturnType<typeof buildImportQueriesFromFocus>;
  onProgress?: (msg: string) => void;
}

export interface TenderSyncResult {
  success: boolean;
  mode: SyncMode;
  purged: number;
  expiredDeleted: number;
  cacheDirsRemoved: number;
  created: number;
  updated: number;
  createdTenderIds: string[];
  scanned: number;
  imported: number;
  tzEnriched: number;
  skipped: number;
  errors: string[];
  total: number;
  message: string;
}

export async function runTenderSync(options: RunTenderSyncOptions = {}): Promise<TenderSyncResult> {
  const mode: SyncMode = options.mode === "catalog" ? "catalog" : "smart";
  const defaultLimit = mode === "catalog" ? 1200 : 220;
  const limitParam = options.limit ?? defaultLimit;
  const config = resolveSyncConfig(mode, limitParam);

  const purged = await purgeNonEisTenders(prisma);
  const maintenance = await runTenderMaintenance(prisma);

  const importResult = await importMedicalTendersFromEis({
    limit: config.limit,
    recordsPerQuery: config.recordsPerQuery,
    searchPages: config.searchPages,
    concurrency: config.concurrency,
    medicalOnly: true,
    parseTzFiles: config.parseTzFiles,
    fastImport: config.fastImport,
    smartMode: config.smartMode,
    tzTopN: config.tzTopN,
    companyFocus: options.companyFocus ?? null,
    searchQueries: options.searchQueries,
    onProgress: options.onProgress,
  });

  let created = 0;
  let updated = 0;
  const createdTenderIds: string[] = [];
  const affectedTenderIds: string[] = [];

  for (const t of importResult.tenders) {
    const existing = await prisma.tender.findUnique({ where: { externalId: t.externalId } });
    const reqRow = tenderRowFromRequirements(t.requirements as Record<string, unknown>);
    const record = await prisma.tender.upsert({
      where: { externalId: t.externalId },
      update: {
        title: t.title,
        description: t.description,
        customerName: t.customerName,
        region: t.region,
        price: t.price,
        publishedAt: t.publishedAt,
        deadline: t.deadline,
        category: t.category,
        okvedCode: t.okvedCode,
        sourceUrl: t.sourceUrl,
        status: "active",
        ...reqRow,
      },
      create: {
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        customerName: t.customerName,
        region: t.region,
        price: t.price,
        publishedAt: t.publishedAt,
        deadline: t.deadline,
        category: t.category,
        okvedCode: t.okvedCode,
        sourceUrl: t.sourceUrl,
        status: "active",
        ...reqRow,
      },
    });
    if (existing) updated++;
    else {
      created++;
      createdTenderIds.push(record.id);
    }
    affectedTenderIds.push(record.id);
  }

  if (affectedTenderIds.length > 0) {
    void rebuildTendersForAllCompanies(affectedTenderIds);
  }

  const total = await prisma.tender.count({ where: REAL_EIS_TENDER_WHERE });

  const message =
    mode === "catalog"
      ? `Каталог: ${created} новых, ${updated} обновлено. Найдено в поиске: ${importResult.scanned}. В базе ${total}.` +
        (maintenance.expiredTendersDeleted > 0
          ? ` Удалено просроченных: ${maintenance.expiredTendersDeleted}.`
          : "")
      : `Подбор: ${created} новых, ${updated} обновлено. Карточек ЕИС: ${importResult.noticeEnriched ?? importResult.imported}. С разбором ТЗ: ${importResult.tzEnriched ?? 0}. В базе ${total}.` +
        (maintenance.expiredTendersDeleted > 0
          ? ` Удалено просроченных: ${maintenance.expiredTendersDeleted}.`
          : "");

  invalidateTenderCountCache().catch(() => {});

  return {
    success: true,
    mode,
    purged,
    expiredDeleted: maintenance.expiredTendersDeleted,
    cacheDirsRemoved: maintenance.expiredCacheDirsRemoved + maintenance.orphanCacheDirsRemoved,
    created,
    updated,
    createdTenderIds,
    scanned: importResult.scanned,
    imported: importResult.imported,
    tzEnriched: importResult.tzEnriched ?? 0,
    skipped: importResult.skipped,
    errors: importResult.errors.slice(0, 5),
    total,
    message,
  };
}

/** Фокус компании для персонализированного импорта (кнопка в UI). */
export async function buildSyncFocusForCompany(companyId: string) {
  const documents = await loadDocumentsForMatching(companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { companyFocus: null, searchQueries: undefined };

  const catalogProducts = mapCompanyDocuments(documents)
    .filter((d) => d.isRelevant && d.products?.length)
    .flatMap((d) => d.products || []);

  const companyFocus = buildCompanyFocus({
    description: company.description,
    catalogProducts,
  });
  const searchQueries = buildImportQueriesFromFocus(companyFocus);
  return { companyFocus, searchQueries };
}

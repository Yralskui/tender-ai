/**
 * Разбор ТЗ для одной закупки или пакетом в фоне.
 */

import { prisma } from "@/lib/prisma";
import { fetchNoticeDetails, toImportedTender } from "@/lib/zakupkiImport";
import { rebuildTendersForAllCompanies } from "@/lib/tenderFeedCache";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import type { Prisma } from "@/generated/prisma/client";

const PENDING_TZ_WHERE: Prisma.TenderWhereInput = {
  status: "active",
  AND: [
    { requirements: { contains: '"importedFromEis":true' } },
    { requirements: { contains: '"tzEnrichmentPending":true' } },
  ],
};

export interface TzEnrichmentJobState {
  running: boolean;
  processed: number;
  enriched: number;
  lastMessage: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SingleTzEnrichResult {
  success: boolean;
  tenderId: string;
  externalId: string;
  tzParsedFromFile: boolean;
  tzEnrichmentPending: boolean;
  specCount: number;
  productCount: number;
  importMode?: string;
  message: string;
  error?: string;
  transientNetworkError?: boolean;
}

let state: TzEnrichmentJobState = {
  running: false,
  processed: 0,
  enriched: 0,
  lastMessage: "",
};

export function getTzEnrichmentState(): TzEnrichmentJobState {
  return { ...state };
}

/** Сбой сети / DNS — закупку не снимаем с очереди, повторим позже */
export function isTransientNetworkError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.message);
    else if (cause != null) parts.push(String(cause));
  } else {
    parts.push(String(error));
  }
  const blob = parts.join(" ").toLowerCase();
  return (
    blob.includes("enotfound") ||
    blob.includes("econnreset") ||
    blob.includes("econnrefused") ||
    blob.includes("etimedout") ||
    blob.includes("connect timeout") ||
    blob.includes("und_err_connect_timeout") ||
    blob.includes("fetch failed") ||
    blob.includes("network") ||
    blob.includes("socket hang up") ||
    blob.includes("aborted due to timeout")
  );
}

export async function countPendingTzEnrichment(): Promise<number> {
  return prisma.tender.count({ where: PENDING_TZ_WHERE });
}

/** Приоритетный разбор ТЗ одной закупки (кнопка в карточке). */
export async function enrichTenderById(
  tenderId: string,
  options: { skipFeedCache?: boolean; batchLight?: boolean } = {}
): Promise<SingleTzEnrichResult> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) {
    return {
      success: false,
      tenderId,
      externalId: "",
      tzParsedFromFile: false,
      tzEnrichmentPending: true,
      specCount: 0,
      productCount: 0,
      message: "Закупка не найдена",
      error: "not_found",
    };
  }

  let reqs: Record<string, unknown> = {};
  try {
    reqs = JSON.parse(tender.requirements);
  } catch {
    return {
      success: false,
      tenderId,
      externalId: tender.externalId,
      tzParsedFromFile: false,
      tzEnrichmentPending: true,
      specCount: 0,
      productCount: 0,
      message: "Ошибка данных закупки",
      error: "invalid_requirements",
    };
  }

  try {
    const noticeType = (reqs.noticeType as string) || "ea20";

    let details = await fetchNoticeDetails(tender.externalId, noticeType, {
      parseTzFiles: false,
    });

    const htmlSpecCount = details.productSpecs?.length ?? 0;
    const htmlProductCount = details.tzProducts?.length ?? 0;
    const htmlEnough = htmlSpecCount >= 2 || htmlProductCount >= 1;

    if (!htmlEnough || !options.batchLight) {
      details = await fetchNoticeDetails(tender.externalId, noticeType, {
        parseTzFiles: true,
        tzEnrich: options.batchLight
          ? { batchLight: true, maxDocuments: 2, maxAllDocuments: 2 }
          : undefined,
      });
    }

    const entry = {
      regNumber: tender.externalId,
      noticeType,
      procedureType: (reqs.procedureType as string) || "44-ФЗ",
      status: (reqs.eisStage as string) || "",
      title: tender.title,
      customerName: tender.customerName,
      price: tender.price,
      publishedAt: tender.publishedAt,
      deadline: tender.deadline,
      sourceUrl: tender.sourceUrl || "",
    };

    const imported = toImportedTender(entry, details, {
      category: tender.category,
      okved: tender.okvedCode || "46.46",
    });

    const requirements = normalizeStoredRequirements(
      imported.requirements as {
        productSpecs?: string[];
        tzProducts?: string[];
        tzVolumes?: Array<{
          name?: string;
          quantity: number;
          unit?: string;
          position?: string;
          ktruCode?: string;
        }>;
        technicalAssignment?: string;
      }
    ) as Record<string, unknown>;
    const enriched = imported.requirements as Record<string, unknown>;

    const specCount = (requirements.productSpecs as string[] | undefined)?.length ?? 0;
    const productCount = (requirements.tzProducts as string[] | undefined)?.length ?? 0;
    const tzParsedFromFile = enriched.tzParsedFromFile === true;

    // После попытки разбора убираем из очереди — иначе одни и те же закупки крутятся вечно
    requirements.tzEnrichmentPending = false;
    requirements.tzEnrichmentAttemptedAt = new Date().toISOString();
    requirements.tzParsedFromFile = tzParsedFromFile;
    if (!tzParsedFromFile) {
      requirements.tzEnrichmentNote =
        specCount > 0 || productCount > 0
          ? "Разобрано из карточки ЕИС; файл ТЗ не дал полного списка позиций"
          : "Файл ТЗ не найден или не разобран";
    } else {
      delete requirements.tzEnrichmentNote;
    }

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        title: imported.title,
        requirements: JSON.stringify(requirements),
      },
    });

    if (!options.skipFeedCache) {
      void rebuildTendersForAllCompanies([tender.id]);
    }

    const tzEnrichmentPending = false;

    return {
      success: true,
      tenderId: tender.id,
      externalId: tender.externalId,
      tzParsedFromFile,
      tzEnrichmentPending,
      specCount,
      productCount,
      importMode: enriched.importMode as string | undefined,
      message: tzParsedFromFile
        ? `ТЗ из файла: ${specCount} характеристик, ${productCount} позиций`
        : specCount > 0
          ? `Карточка ЕИС: ${specCount} характеристик${productCount > 0 ? `, ${productCount} позиций` : ""}`
          : "Документы скачаны, в файлах не найдено характеристик — проверьте на zakupki.gov.ru",
    };
  } catch (e) {
    const transient = isTransientNetworkError(e);
    if (!transient) {
      console.error(`[tz-enrich] ${tender.externalId}:`, e);
    } else {
      console.warn(`[tz-enrich] ${tender.externalId}: сеть недоступна, останется в очереди`);
    }
    try {
      const prev = JSON.parse(tender.requirements) as Record<string, unknown>;
      if (transient) {
        prev.tzEnrichmentPending = true;
        prev.tzEnrichmentLastNetworkError = new Date().toISOString();
      } else {
        prev.tzEnrichmentPending = false;
        prev.tzEnrichmentAttemptedAt = new Date().toISOString();
        prev.tzEnrichmentError = String(e).slice(0, 240);
      }
      await prisma.tender.update({
        where: { id: tender.id },
        data: { requirements: JSON.stringify(prev) },
      });
      if (!transient) {
        if (!options.skipFeedCache) {
          void rebuildTendersForAllCompanies([tender.id]);
        }
      }
    } catch {
      /* ignore secondary failure */
    }
    return {
      success: false,
      tenderId: tender.id,
      externalId: tender.externalId,
      tzParsedFromFile: false,
      tzEnrichmentPending: transient,
      specCount: 0,
      productCount: 0,
      message: transient
        ? "Нет связи с zakupki.gov.ru — закупка останется в очереди"
        : "Не удалось скачать или разобрать ТЗ",
      error: String(e),
      transientNetworkError: transient,
    };
  }
}

const TENDER_ENRICH_TIMEOUT_MS = 75_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Таймаут ${Math.round(ms / 1000)} с: ${label}`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function enrichPendingTendersInBackground(
  limit = 80,
  options: { skipFeedCache?: boolean } = {}
): Promise<TzEnrichmentJobState> {
  if (state.running) return getTzEnrichmentState();

  const batchLimit = Math.max(1, Math.min(500, Math.floor(limit) || 80));

  state = {
    running: true,
    processed: 0,
    enriched: 0,
    lastMessage: "Поиск закупок без разбора ТЗ…",
    startedAt: new Date().toISOString(),
  };

  void (async () => {
    const updatedTenderIds: string[] = [];
    try {
      state.lastMessage = "Считаем очередь в базе…";
      const pendingTotal = await countPendingTzEnrichment();
      const tenders = await prisma.tender.findMany({
        where: PENDING_TZ_WHERE,
        orderBy: [{ deadline: "asc" }, { publishedAt: "desc" }],
        take: batchLimit,
        select: { id: true, externalId: true },
      });

      state.lastMessage =
        pendingTotal > tenders.length
          ? `Разбор ТЗ: ${tenders.length} из ${pendingTotal} в очереди…`
          : `Разбор ТЗ: ${tenders.length} закупок…`;

      let networkFails = 0;

      for (const tender of tenders) {
        state.lastMessage = `Загрузка ${tender.externalId}… (${state.processed}/${tenders.length})`;
        state.processed += 1;
        let result: SingleTzEnrichResult;
        try {
          result = await withTimeout(
            enrichTenderById(tender.id, {
              skipFeedCache: options.skipFeedCache,
              batchLight: true,
            }),
            TENDER_ENRICH_TIMEOUT_MS,
            tender.externalId
          );
        } catch (e) {
          result = {
            success: false,
            tenderId: tender.id,
            externalId: tender.externalId,
            tzParsedFromFile: false,
            tzEnrichmentPending: isTransientNetworkError(e),
            specCount: 0,
            productCount: 0,
            message: isTransientNetworkError(e)
              ? "Нет связи с zakupki.gov.ru — закупка останется в очереди"
              : "Превышено время ожидания разбора ТЗ",
            error: String(e),
            transientNetworkError: isTransientNetworkError(e),
          };
          if (!result.transientNetworkError) {
            try {
              const row = await prisma.tender.findUnique({ where: { id: tender.id } });
              if (row) {
                const prev = JSON.parse(row.requirements) as Record<string, unknown>;
                prev.tzEnrichmentPending = false;
                prev.tzEnrichmentAttemptedAt = new Date().toISOString();
                prev.tzEnrichmentError = String(e).slice(0, 240);
                await prisma.tender.update({
                  where: { id: tender.id },
                  data: { requirements: JSON.stringify(prev) },
                });
                updatedTenderIds.push(tender.id);
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (!result.transientNetworkError && result.success) {
          updatedTenderIds.push(tender.id);
        }
        if (result.transientNetworkError) {
          networkFails += 1;
          state.lastMessage = `⚠ нет связи с zakupki.gov.ru (${networkFails} подряд)`;
          if (networkFails >= 5) {
            state.lastMessage = "Пауза 60 с — zakupki.gov.ru не отвечает…";
            await new Promise((r) => setTimeout(r, 60_000));
            networkFails = 0;
          }
        } else {
          networkFails = 0;
        }
        if (result.tzParsedFromFile) {
          state.enriched += 1;
          state.lastMessage = `✓ ТЗ: ${result.externalId} (${state.enriched}/${state.processed})`;
        } else if (!result.transientNetworkError) {
          state.lastMessage = `· ${result.externalId} (${state.processed}/${tenders.length})`;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      const remaining = await countPendingTzEnrichment();
      state.lastMessage =
        state.enriched > 0
          ? `Разобрано ТЗ: ${state.enriched} из ${state.processed}. В очереди ещё ${remaining}`
          : `Обработано ${state.processed}, файлов ТЗ не найдено. В очереди ещё ${remaining}`;

      if (options.skipFeedCache && updatedTenderIds.length > 0) {
        state.lastMessage = `Пакет готов (${updatedTenderIds.length} в БД). Кэш ленты — после всего прогона.`;
      }
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  })();

  return getTzEnrichmentState();
}

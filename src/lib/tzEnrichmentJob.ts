/**
 * Разбор ТЗ для одной закупки или пакетом в фоне.
 */

import { prisma } from "@/lib/prisma";
import { fetchNoticeDetails, toImportedTender } from "@/lib/zakupkiImport";
import { rebuildTendersForAllCompaniesNow } from "@/lib/tenderFeedCache";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import { tenderRowFromRequirements } from "@/lib/tenderMeta";
import { summarizeTzDisplayCounts } from "@/lib/tenderPresentation";
import type { Prisma } from "@/generated/prisma/client";

const PENDING_TZ_WHERE: Prisma.TenderWhereInput = {
  status: "active",
  importedFromEis: true,
  tzEnrichmentPending: true,
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

/** Сбой TLS из‑за отечественного сертификата zakupki.gov.ru (Минцифры) */
export function isRussianTlsCertError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.message, (cause as Error & { code?: string }).code || "");
    else if (cause != null) parts.push(String(cause));
    const code = (error as Error & { code?: string }).code;
    if (code) parts.push(code);
  } else {
    parts.push(String(error));
  }
  const blob = parts.join(" ").toLowerCase();
  return (
    blob.includes("unable to verify") ||
    blob.includes("self-signed") ||
    blob.includes("self signed") ||
    blob.includes("certificate") ||
    blob.includes("cert_") ||
    blob.includes("unknown ca") ||
    blob.includes("err_tls")
  );
}

/** Сбой сети / DNS — закупку не снимаем с очереди, повторим позже */
export function isTransientNetworkError(error: unknown): boolean {
  if (isEisRateLimitError(error)) return true;
  if (isRussianTlsCertError(error)) return true;
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

/** zakupki.gov.ru отвечает 434/503 при перегрузке или rate-limit */
export function isEisRateLimitError(error: unknown): boolean {
  const blob = String(error instanceof Error ? error.message : error);
  return /\bHTTP 434\b/.test(blob) || /\bHTTP 503\b/.test(blob) || /\bHTTP 429\b/.test(blob);
}

let eisRateLimitPausedUntil = 0;

export function isEisRateLimitPaused(): boolean {
  return Date.now() < eisRateLimitPausedUntil;
}

function pauseEisRateLimit(minutes = 10): void {
  eisRateLimitPausedUntil = Date.now() + minutes * 60_000;
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

    // Файл ТЗ всегда скачивается и разбирается — карточка ЕИС одна может не содержать
    // важные числовые характеристики (толщина/размеры и т.п.), которые есть только в файле.
    // В batchLight-режиме объём ограничен (maxDocuments/maxAllDocuments), чтобы не перегружать очередь.
    const details = await fetchNoticeDetails(tender.externalId, noticeType, {
      parseTzFiles: true,
      tzEnrich: options.batchLight
        ? { batchLight: true, maxDocuments: 2, maxAllDocuments: 2 }
        : undefined,
    });

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
        description: imported.description,
        customerName: imported.customerName,
        region: imported.region,
        price: imported.price,
        publishedAt: imported.publishedAt,
        deadline: imported.deadline,
        sourceUrl: imported.sourceUrl,
        ...tenderRowFromRequirements(requirements),
      },
    });

    if (!options.skipFeedCache) {
      rebuildTendersForAllCompaniesNow([tender.id]);
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
      if (isRussianTlsCertError(e)) {
        console.warn(
          `[tz-enrich] ${tender.externalId}: TLS-сертификат zakupki.gov.ru не доверен — установите корневой сертификат Минцифры (gosuslugi.ru/crt) и задайте ZAKUPKI_CA_FILE в .env`
        );
      } else {
        console.warn(`[tz-enrich] ${tender.externalId}: сеть недоступна, останется в очереди`);
      }
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
        data: tenderRowFromRequirements(prev),
      });
      if (!transient) {
        if (!options.skipFeedCache) {
          rebuildTendersForAllCompaniesNow([tender.id]);
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
      message: formatZakupkiEnrichError(e, transient),
      error: String(e),
      transientNetworkError: transient,
    };
  }
}

function formatZakupkiEnrichError(error: unknown, transient: boolean): string {
  if (isEisRateLimitError(error)) {
    return "zakupki.gov.ru временно ограничивает запросы (слишком часто). Подождите 10–15 минут и попробуйте снова.";
  }
  if (transient) {
    return "Не удалось связаться с zakupki.gov.ru. Проверьте интернет; если сайт открывается в браузере — подождите и повторите (сервер ЕИС мог быть перегружен).";
  }
  return "Не удалось скачать или разобрать ТЗ";
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
  if (isEisRateLimitPaused()) {
    state.lastMessage = "Пауза: zakupki.gov.ru ограничивает запросы";
    return getTzEnrichmentState();
  }

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
        take: batchLimit * 2,
        select: { id: true, externalId: true, requirements: true },
      });

      const prioritized = tenders
        .map((t) => {
          let reqs: Record<string, unknown> = {};
          try {
            reqs = JSON.parse(t.requirements) as Record<string, unknown>;
          } catch {}
          const products = ((reqs.tzProducts as string[]) || []).length;
          const specs = ((reqs.productSpecs as string[]) || []).length;
          return { tender: t, priority: products > 0 ? 2 : specs > 0 ? 1 : 0 };
        })
        .sort((a, b) => b.priority - a.priority)
        .slice(0, batchLimit)
        .map((x) => x.tender);

      state.lastMessage =
        pendingTotal > prioritized.length
          ? `Разбор ТЗ: ${prioritized.length} из ${pendingTotal} в очереди…`
          : `Разбор ТЗ: ${prioritized.length} закупок…`;

      let networkFails = 0;
      let rateLimitHits = 0;

      for (const tender of prioritized) {
        state.lastMessage = `Загрузка ${tender.externalId}… (${state.processed}/${prioritized.length})`;
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
                  data: tenderRowFromRequirements(prev),
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
          const rateLimited =
            isEisRateLimitError(result.error) || isEisRateLimitError(result.message);
          if (rateLimited) {
            rateLimitHits += 1;
            state.lastMessage = `⚠ zakupki.gov.ru: лимит запросов (${rateLimitHits})`;
            if (rateLimitHits >= 3) {
              pauseEisRateLimit(10);
              state.lastMessage = "Пауза 10 мин — zakupki.gov.ru ограничивает запросы (434)";
              break;
            }
            await new Promise((r) => setTimeout(r, 90_000));
          } else {
            state.lastMessage = `⚠ нет связи с zakupki.gov.ru (${networkFails} подряд)`;
            if (networkFails >= 5) {
              state.lastMessage = "Пауза 60 с — zakupki.gov.ru не отвечает…";
              await new Promise((r) => setTimeout(r, 60_000));
              networkFails = 0;
            }
          }
        } else {
          networkFails = 0;
          rateLimitHits = 0;
        }
        if (result.tzParsedFromFile) {
          state.enriched += 1;
          state.lastMessage = `✓ ТЗ: ${result.externalId} (${state.enriched}/${state.processed})`;
        } else if (!result.transientNetworkError) {
          state.lastMessage = `· ${result.externalId} (${state.processed}/${prioritized.length})`;
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

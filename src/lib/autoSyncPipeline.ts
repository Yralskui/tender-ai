/**
 * Непрерывный цикл: уборка старых → подгрузка новых с ЕИС → разбор ТЗ.
 */

import { runTenderSync, type SyncMode } from "@/lib/tenderSync";
import { notifyUsersAfterSync } from "@/lib/notificationJobs";
import { enrichPendingTendersInBackground } from "@/lib/tzEnrichmentJob";
import { isSyncRunning } from "@/lib/syncJob";
import {
  readAutoSyncState,
  writeAutoSyncState,
  shouldRunAutoSync,
  getAutoSyncIntervalMs,
  healStuckRunning,
} from "@/lib/autoSyncState";

export interface AutoSyncCycleOptions {
  mode?: SyncMode;
  limit?: number;
  force?: boolean;
  skipNotifications?: boolean;
  onProgress?: (msg: string) => void;
}

export interface AutoSyncCycleResult {
  skipped: boolean;
  reason?: string;
  maintenance?: {
    expiredTendersDeleted: number;
    cacheDirsRemoved: number;
  };
  sync?: {
    created: number;
    updated: number;
    total: number;
    scanned: number;
  };
  notificationsSent?: number;
  message: string;
}

let cycleLock = false;

export async function runAutoSyncCycle(
  options: AutoSyncCycleOptions = {}
): Promise<AutoSyncCycleResult> {
  let state = await readAutoSyncState();
  if (state.running && !healStuckRunning(state).running) {
    await writeAutoSyncState({
      running: false,
      lastError: "interrupted: предыдущий цикл не завершился",
    });
    state = await readAutoSyncState();
  }

  if (!options.force && !shouldRunAutoSync(state)) {
    return {
      skipped: true,
      reason: "interval",
      message: `Следующее автообновление через ${Math.ceil((state.intervalMs - (Date.now() - new Date(state.lastFinishedAt || 0).getTime())) / 60_000)} мин`,
    };
  }

  if (cycleLock || isSyncRunning()) {
    return { skipped: true, reason: "busy", message: "Синхронизация уже выполняется" };
  }

  cycleLock = true;
  await writeAutoSyncState({ running: true, lastStartedAt: new Date().toISOString() });

  const mode: SyncMode = options.mode === "smart" ? "smart" : "catalog";
  const defaultLimit = mode === "catalog" ? 800 : 220;
  const limit = options.limit ?? defaultLimit;

  try {
    options.onProgress?.("Подгрузка и уборка базы zakupki.gov.ru…");
    const syncResult = await runTenderSync({
      mode,
      limit,
      onProgress: options.onProgress,
    });

    let notificationsSent = 0;
    if (!options.skipNotifications && syncResult.createdTenderIds.length > 0) {
      options.onProgress?.("Уведомления о новых закупках…");
      const notify = await notifyUsersAfterSync(syncResult.createdTenderIds);
      notificationsSent = notify.notified;
    }

    options.onProgress?.("Фоновый разбор ТЗ…");
    void enrichPendingTendersInBackground(80);

    const cacheRemoved = syncResult.cacheDirsRemoved;
    const expiredDeleted = syncResult.expiredDeleted;

    const message = [
      expiredDeleted > 0 ? `удалено ${expiredDeleted} просроченных` : null,
      cacheRemoved > 0 ? `очищено ${cacheRemoved} кэш-папок ТЗ` : null,
      `+${syncResult.created} новых, ${syncResult.updated} обновлено`,
      `в базе ${syncResult.total}`,
    ]
      .filter(Boolean)
      .join(" · ");

    await writeAutoSyncState({
      running: false,
      lastFinishedAt: new Date().toISOString(),
      lastError: undefined,
      lastMessage: message,
      maintenance: {
        expiredTendersDeleted: expiredDeleted,
        cacheDirsRemoved: cacheRemoved,
      },
      sync: {
        created: syncResult.created,
        updated: syncResult.updated,
        total: syncResult.total,
      },
    });

    return {
      skipped: false,
      maintenance: {
        expiredTendersDeleted: expiredDeleted,
        cacheDirsRemoved: cacheRemoved,
      },
      sync: {
        created: syncResult.created,
        updated: syncResult.updated,
        total: syncResult.total,
        scanned: syncResult.scanned,
      },
      notificationsSent,
      message,
    };
  } catch (error) {
    const err = String(error);
    await writeAutoSyncState({
      running: false,
      lastFinishedAt: new Date().toISOString(),
      lastError: err,
      lastMessage: "Ошибка автообновления",
    });
    throw error;
  } finally {
    cycleLock = false;
  }
}

export async function getAutoSyncStatus() {
  const state = await readAutoSyncState();
  return {
    ...state,
    intervalMinutes: Math.round(getAutoSyncIntervalMs() / 60_000),
    due: shouldRunAutoSync(state),
  };
}

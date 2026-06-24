/**
 * Фоновый планировщик: подгрузка с ЕИС + разбор ТЗ по CD (AUTO_SYNC_INTERVAL_MS).
 * Стартует из instrumentation.ts вместе с сервером Next.js.
 */

import { runAutoSyncCycle } from "@/lib/autoSyncPipeline";
import { getAutoSyncIntervalMs } from "@/lib/autoSyncState";

declare global {
  // eslint-disable-next-line no-var
  var __tenderAiAutoSyncScheduler: boolean | undefined;
}

const TICK_MS = 60_000;
const START_DELAY_MS = 45_000;

export function startAutoSyncScheduler(): void {
  if (globalThis.__tenderAiAutoSyncScheduler) return;
  if (process.env.AUTO_SYNC_DISABLE === "1") {
    console.log("[auto-sync] планировщик отключён (AUTO_SYNC_DISABLE=1)");
    return;
  }

  globalThis.__tenderAiAutoSyncScheduler = true;

  const cdMin = Math.round(getAutoSyncIntervalMs() / 60_000);
  console.log(`[auto-sync] планировщик: CD ${cdMin} мин, проверка каждую минуту`);

  let ticking = false;

  async function tick(label: string) {
    if (ticking) return;
    ticking = true;
    try {
      const result = await runAutoSyncCycle({ force: false });
      if (!result.skipped) {
        console.log(`[auto-sync] ${label}: ${result.message}`);
      }
    } catch (error) {
      console.error("[auto-sync] ошибка цикла:", error);
    } finally {
      ticking = false;
    }
  }

  setTimeout(() => void tick("старт"), START_DELAY_MS);
  setInterval(() => void tick("по CD"), TICK_MS);
}

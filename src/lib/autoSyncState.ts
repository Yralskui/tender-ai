/**
 * Состояние автосинхронизации (файл на диске — переживает перезапуск dev-сервера).
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const STATE_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(STATE_DIR, "auto-sync-state.json");

export interface AutoSyncState {
  running: boolean;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastError?: string;
  lastMessage?: string;
  /** Минимальный интервал между циклами (мс) */
  intervalMs: number;
  maintenance?: {
    expiredTendersDeleted: number;
    cacheDirsRemoved: number;
  };
  sync?: {
    created: number;
    updated: number;
    total: number;
  };
  tzEnriched?: number;
}

/** CD между циклами автообновления (мс). По умолчанию 20 мин. Минимум 5 мин. */
export const AUTO_SYNC_DEFAULT_INTERVAL_MS = 20 * 60 * 1000;

const STUCK_RUNNING_MS = 15 * 60 * 1000;

const DEFAULT_STATE: AutoSyncState = {
  running: false,
  intervalMs: AUTO_SYNC_DEFAULT_INTERVAL_MS,
};

export function getAutoSyncIntervalMs(): number {
  const raw = process.env.AUTO_SYNC_INTERVAL_MS;
  const n = raw ? parseInt(raw, 10) : AUTO_SYNC_DEFAULT_INTERVAL_MS;
  return Number.isFinite(n) && n >= 5 * 60 * 1000 ? n : AUTO_SYNC_DEFAULT_INTERVAL_MS;
}

export function healStuckRunning(state: AutoSyncState): AutoSyncState {
  if (!state.running || !state.lastStartedAt) return state;
  const elapsed = Date.now() - new Date(state.lastStartedAt).getTime();
  if (elapsed < STUCK_RUNNING_MS) return state;
  return {
    ...state,
    running: false,
    lastError: "interrupted: предыдущий цикл не завершился",
  };
}

export async function readAutoSyncState(): Promise<AutoSyncState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as AutoSyncState;
    const merged = { ...DEFAULT_STATE, ...parsed, intervalMs: getAutoSyncIntervalMs() };
    return healStuckRunning(merged);
  } catch {
    return { ...DEFAULT_STATE, intervalMs: getAutoSyncIntervalMs() };
  }
}

export async function writeAutoSyncState(patch: Partial<AutoSyncState>): Promise<AutoSyncState> {
  await mkdir(STATE_DIR, { recursive: true });
  const prev = await readAutoSyncState();
  const next: AutoSyncState = {
    ...prev,
    ...patch,
    intervalMs: getAutoSyncIntervalMs(),
  };
  await writeFile(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function shouldRunAutoSync(state: AutoSyncState): boolean {
  const healed = healStuckRunning(state);
  if (state.running && !healed.running) return true;
  if (healed.running) return false;
  if (!healed.lastFinishedAt && !healed.lastStartedAt) return true;
  const last = healed.lastFinishedAt || healed.lastStartedAt;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= healed.intervalMs;
}

export function formatAutoSyncAgo(state: AutoSyncState): string | null {
  const last = state.lastFinishedAt;
  if (!last) return null;
  const min = Math.round((Date.now() - new Date(last).getTime()) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return `${h} ч назад`;
}

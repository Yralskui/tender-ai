/**
 * Состояние фоновой синхронизации (in-memory, для одного сервера / dev).
 */

export type SyncJobPhase = "idle" | "search" | "notices" | "tz" | "notify" | "done" | "error";

export interface SyncJobState {
  id: string;
  phase: SyncJobPhase;
  mode: "smart" | "catalog";
  startedAt: string;
  finishedAt?: string;
  message: string;
  progress: string;
  created: number;
  updated: number;
  notificationsSent: number;
  tzEnriched: number;
  error?: string;
}

let currentJob: SyncJobState | null = null;
let running = false;

export function getSyncJobState(): SyncJobState | null {
  return currentJob;
}

export function isSyncRunning(): boolean {
  return running;
}

export async function runSyncJobInBackground(
  runner: (onProgress: (msg: string, phase?: SyncJobPhase) => void) => Promise<{
    created: number;
    updated: number;
    notificationsSent: number;
    tzEnriched: number;
    message: string;
  }>
): Promise<SyncJobState> {
  if (running && currentJob) {
    return currentJob;
  }

  const job: SyncJobState = {
    id: `sync-${Date.now()}`,
    phase: "search",
    mode: "smart",
    startedAt: new Date().toISOString(),
    message: "Синхронизация запущена",
    progress: "Старт…",
    created: 0,
    updated: 0,
    notificationsSent: 0,
    tzEnriched: 0,
  };

  currentJob = job;
  running = true;

  void (async () => {
    try {
      const result = await runner((msg, phase) => {
        if (currentJob) {
          currentJob.progress = msg;
          if (phase) currentJob.phase = phase;
        }
      });
      if (currentJob) {
        currentJob.phase = "done";
        currentJob.finishedAt = new Date().toISOString();
        currentJob.created = result.created;
        currentJob.updated = result.updated;
        currentJob.notificationsSent = result.notificationsSent;
        currentJob.tzEnriched = result.tzEnriched;
        currentJob.message = result.message;
      }
    } catch (error) {
      if (currentJob) {
        currentJob.phase = "error";
        currentJob.finishedAt = new Date().toISOString();
        currentJob.error = String(error);
        currentJob.message = "Ошибка синхронизации";
      }
    } finally {
      running = false;
    }
  })();

  return job;
}

/**
 * Где выполняются фоновые задачи: в Next.js или в отдельном worker.
 */

/**
 * Где выполняются тяжёлые фоны (feed-cache, AI-документы, stale-rebuild).
 * В dev по умолчанию — в отдельном worker (`npm run worker`), Next только отдаёт страницы.
 */
export function backgroundJobsInNext(): boolean {
  if (process.env.WORKER_MODE === "1") return false;
  if (process.env.BACKGROUND_JOBS_IN_NEXT === "0") return false;
  if (process.env.BACKGROUND_JOBS_IN_NEXT === "1") return true;
  if (process.env.NODE_ENV === "development") return false;
  return true;
}

export function isWorkerProcess(): boolean {
  return process.env.WORKER_MODE === "1";
}

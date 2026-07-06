export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { backgroundJobsInNext } = await import("@/lib/runtimeConfig");
  if (!backgroundJobsInNext()) {
    console.log("[runtime] фоновые задачи в Next отключены — используйте npm run worker");
    return;
  }

  const { startAutoSyncScheduler } = await import("@/lib/autoSyncScheduler");
  startAutoSyncScheduler();
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { startAutoSyncScheduler } = await import("@/lib/autoSyncScheduler");
  startAutoSyncScheduler();
}

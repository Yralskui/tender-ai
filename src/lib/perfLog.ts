/**
 * Серверные логи производительности (терминал `npm run dev`).
 * Включено в development; в production — только при PERF_LOG=1.
 * Отключить в dev: PERF_LOG=0
 */

function perfLoggingEnabled(): boolean {
  if (process.env.PERF_LOG === "0") return false;
  if (process.env.PERF_LOG === "1") return true;
  return process.env.NODE_ENV === "development";
}

function formatExtra(extra?: Record<string, unknown>): string {
  if (!extra || Object.keys(extra).length === 0) return "";
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return "";
  }
}

export function perfLog(scope: string, message: string, extra?: Record<string, unknown>) {
  if (!perfLoggingEnabled()) return;
  console.log(`[perf] ${scope} ${message}${formatExtra(extra)}`);
}

export function createPerfTimer(scope: string) {
  const t0 = performance.now();
  let last = t0;
  let stepN = 0;

  return {
    step(label: string, extra?: Record<string, unknown>) {
      if (!perfLoggingEnabled()) return;
      const now = performance.now();
      const delta = Math.round(now - last);
      const total = Math.round(now - t0);
      stepN += 1;
      console.log(
        `[perf] ${scope} #${stepN} ${label} +${delta}ms (Σ ${total}ms)${formatExtra(extra)}`
      );
      last = now;
    },
    end(label = "готово", extra?: Record<string, unknown>) {
      if (!perfLoggingEnabled()) return;
      const total = Math.round(performance.now() - t0);
      console.log(`[perf] ${scope} ✓ ${label} — ${total}ms${formatExtra(extra)}`);
    },
  };
}

export async function perfTimed<T>(
  scope: string,
  label: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<T> {
  if (!perfLoggingEnabled()) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    perfLog(scope, label, { ms: Math.round(performance.now() - t0), ...extra });
    return result;
  } catch (error) {
    perfLog(scope, `${label} ОШИБКА`, { ms: Math.round(performance.now() - t0) });
    throw error;
  }
}

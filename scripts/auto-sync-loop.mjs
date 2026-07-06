/**
 * Непрерывный цикл для Windows / VPS без docker.
 * Вызывает cron API (если Next запущен) ИЛИ используйте npm run worker напрямую.
 *
 *   npm run auto-sync:loop
 *
 * Для прода предпочтительно: npm run worker (без HTTP к Next)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

loadEnv();

const useWorker = process.env.WORKER_MODE === "1" || process.argv.includes("--worker");

if (useWorker) {
  const { spawn } = await import("child_process");
  console.log("[auto-sync:loop] запуск встроенного worker (tsx)…");
  const child = spawn("npx", ["tsx", "src/worker/run.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, WORKER_MODE: "1", BACKGROUND_JOBS_IN_NEXT: "0" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  const base = process.env.APP_URL || "http://localhost:3000";
  const secret = process.env.CRON_SECRET;
  const intervalMs = Math.max(
    5 * 60 * 1000,
    parseInt(process.env.AUTO_SYNC_INTERVAL_MS || String(20 * 60 * 1000), 10) || 20 * 60 * 1000
  );

  if (!secret) {
    console.error("CRON_SECRET не задан. Для прода: npm run worker");
    process.exit(1);
  }

  async function runCycle() {
    const url = `${base}/api/cron/sync?mode=catalog&limit=800`;
    console.log(`\n[${new Date().toISOString()}] → ${url}`);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(280_000),
      });
      const body = await res.json().catch(() => ({}));
      console.log(res.status, body.message || body.error || JSON.stringify(body).slice(0, 400));
    } catch (e) {
      console.error("cycle error:", e.message || e);
    }
  }

  console.log(`Auto-sync HTTP loop: каждые ${Math.round(intervalMs / 60_000)} мин → ${base}`);
  console.log("Подсказка: npm run worker — без нагрузки на Next.js");
  await runCycle();
  setInterval(runCycle, intervalMs);
}

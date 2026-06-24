/**
 * Непрерывный цикл автообновления для Windows / локального сервера.
 *
 *   npm run auto-sync
 *
 * Переменные (.env):
 *   APP_URL=http://localhost:3000
 *   CRON_SECRET=...
 *   AUTO_SYNC_INTERVAL_MS=1200000   (20 мин по умолчанию, минимум 5 мин)
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

const base = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
const intervalMs = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.AUTO_SYNC_INTERVAL_MS || String(20 * 60 * 1000), 10) || 20 * 60 * 1000
);

if (!secret) {
  console.error("CRON_SECRET не задан в .env");
  process.exit(1);
}

async function runCycle() {
  const url = `${base}/api/cron/sync?mode=catalog&limit=800`;
  const started = new Date().toISOString();
  console.log(`\n[${started}] → ${url}`);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(280_000),
    });
    const body = await res.json().catch(() => ({}));
    console.log(res.status, body.message || body.error || JSON.stringify(body).slice(0, 400));
    if (!res.ok) console.error("cycle failed");
  } catch (e) {
    console.error("cycle error:", e.message || e);
  }
}

console.log(`Auto-sync loop: каждые ${Math.round(intervalMs / 60_000)} мин → ${base}`);
await runCycle();
setInterval(runCycle, intervalMs);

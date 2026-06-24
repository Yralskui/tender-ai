/**
 * Локальный планировщик для Windows / dev.
 *
 * Примеры:
 *   node scripts/run-cron.mjs sync
 *   node scripts/run-cron.mjs notifications
 *   node scripts/run-cron.mjs all
 *
 * Переменные: APP_URL (default http://localhost:3000), CRON_SECRET из .env
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
    // .env optional
  }
}

loadEnv();

const base = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET не задан в .env");
  process.exit(1);
}

const task = process.argv[2] || "all";

async function hit(path) {
  const url = `${base}${path}`;
  console.log(`→ ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(res.status, body.slice(0, 500));
  if (!res.ok) process.exitCode = 1;
}

if (task === "sync" || task === "all") {
  await hit("/api/cron/sync?mode=catalog&limit=800");
}
if (task === "notifications" || task === "all") {
  await hit("/api/cron/notifications");
}

import { readFileSync, existsSync } from "fs";
import path from "path";

/** Загружает .env в process.env (worker/cron не проходят через Next.js). */
export function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    // optional
  }
}

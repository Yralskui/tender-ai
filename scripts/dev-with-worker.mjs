/**
 * Dev: Next.js + worker в двух процессах (тяжёлые задачи не блокируют сайт).
 *   npm run dev:all
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvInto(env) {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return env;
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
      if (key === "ZAKUPKI_CA_FILE" || key === "DATABASE_URL") {
        val = isAbsolute(val) ? val : join(root, val.replace(/^\.\//, ""));
      }
      env[key] = val;
    }
  } catch {
    // optional
  }
  const defaultCa = join(root, "certs", "russian_trusted_root_ca_combined.pem");
  if (!env.ZAKUPKI_CA_FILE && existsSync(defaultCa)) {
    env.ZAKUPKI_CA_FILE = defaultCa;
  } else if (env.ZAKUPKI_CA_FILE) {
    env.ZAKUPKI_CA_FILE = isAbsolute(env.ZAKUPKI_CA_FILE)
      ? env.ZAKUPKI_CA_FILE
      : join(root, String(env.ZAKUPKI_CA_FILE).replace(/^\.\//, ""));
  }
  return env;
}

const npmCmd = process.platform === "win32" ? "npm" : "npm";
const childEnv = loadEnvInto({ ...process.env, FORCE_COLOR: "1" });

function run(name, script) {
  const child = spawn(npmCmd, ["run", script], {
    stdio: "inherit",
    shell: true,
    cwd: root,
    env: childEnv,
  });
  child.on("exit", (code) => {
    console.log(`[dev:all] ${name} exited (${code ?? "?"})`);
    process.exit(code ?? 0);
  });
  return child;
}

console.log("[dev:all] worker + next dev (фоновые задачи в отдельном процессе)");
const worker = run("worker", "worker");
const web = run("web", "dev");

function shutdown() {
  worker.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

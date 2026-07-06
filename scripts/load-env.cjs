const { readFileSync, existsSync } = require("fs");
const { resolve, isAbsolute, join } = require("path");

const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

function resolveFromRoot(val) {
  if (!val) return val;
  const trimmed = String(val).trim();
  if (isAbsolute(trimmed)) return trimmed;
  return join(root, trimmed.replace(/^\.\//, ""));
}

function applyEnvLine(key, val) {
  if (key === "ZAKUPKI_CA_FILE" || key === "DATABASE_URL") {
    val = resolveFromRoot(val);
  }
  process.env[key] = val;
}

if (existsSync(envPath)) {
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
      applyEnvLine(key, val);
    }
  } catch {
    // optional
  }
}

// Всегда абсолютный путь — npm spawn на Windows часто ломает cwd
const defaultCa = join(root, "certs", "russian_trusted_root_ca_combined.pem");
if (process.env.ZAKUPKI_CA_FILE) {
  process.env.ZAKUPKI_CA_FILE = resolveFromRoot(process.env.ZAKUPKI_CA_FILE);
} else if (existsSync(defaultCa)) {
  process.env.ZAKUPKI_CA_FILE = defaultCa;
}

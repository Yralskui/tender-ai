import { existsSync, readFileSync } from "fs";
import path from "path";

const DEFAULT_CA_REL = path.join("certs", "russian_trusted_root_ca_combined.pem");

/** Корень репозитория (где package.json), не зависит от cwd npm/spawn на Windows. */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function resolveCaPath(raw: string, repoRoot: string): string {
  const trimmed = raw.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^\.\//, "");
  return path.join(repoRoot, normalized);
}

/** Абсолютный путь к PEM с российскими CA (root + sub + gost). */
export function resolveZakupkiCaFile(): string | null {
  const repoRoot = findRepoRoot();
  const candidates: string[] = [];

  const fromEnv = process.env.ZAKUPKI_CA_FILE?.trim();
  if (fromEnv) candidates.push(fromEnv);
  candidates.push(DEFAULT_CA_REL);

  for (const raw of candidates) {
    const resolved = resolveCaPath(raw, repoRoot);
    if (existsSync(resolved)) return resolved;
  }

  return null;
}

export function zakupkiTlsDiagnostics(): {
  repoRoot: string;
  envValue?: string;
  resolved: string | null;
  defaultPath: string;
  defaultExists: boolean;
} {
  const repoRoot = findRepoRoot();
  const defaultPath = path.join(repoRoot, DEFAULT_CA_REL);
  return {
    repoRoot,
    envValue: process.env.ZAKUPKI_CA_FILE?.trim() || undefined,
    resolved: resolveZakupkiCaFile(),
    defaultPath,
    defaultExists: existsSync(defaultPath),
  };
}

/** Подключает CA для Node fetch (Linux/прод). На Windows обычно используется curl. */
export function bootstrapZakupkiTls(): void {
  const resolved = resolveZakupkiCaFile();
  if (!resolved) return;
  process.env.ZAKUPKI_CA_FILE = resolved;
  process.env.NODE_EXTRA_CA_CERTS = resolved;
}

export function readZakupkiCaBundle(): string | undefined {
  const resolved = resolveZakupkiCaFile();
  if (!resolved) return undefined;
  return readFileSync(resolved, "utf8");
}

/**
 * Очередь HTTP-запросов к zakupki.gov.ru — не больше N одновременно.
 * Снижает HTTP 434 (rate limit) и не перегружает ЕИС.
 *
 * TLS: Node.js на Windows не всегда доверяет CA из файла (в отличие от curl).
 * Если задан ZAKUPKI_CA_FILE — используем curl.exe с --cacert.
 */

import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import { bootstrapZakupkiTls, resolveZakupkiCaFile } from "@/lib/zakupkiTls";

const execFileAsync = promisify(execFile);

const DEFAULT_CONCURRENCY = Math.min(
  3,
  Math.max(1, parseInt(process.env.ZAKUPKI_HTTP_CONCURRENCY || "2", 10) || 2)
);

const MIN_GAP_MS = Math.max(
  0,
  parseInt(process.env.ZAKUPKI_HTTP_MIN_GAP_MS || "400", 10) || 400
);

type Task<T> = () => Promise<T>;

class ZakupkiHttpQueue {
  private readonly concurrency: number;
  private active = 0;
  private readonly queue: Array<{
    task: Task<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  private lastStartAt = 0;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  run<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as Task<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  private async pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      const gap = MIN_GAP_MS - (Date.now() - this.lastStartAt);
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      this.lastStartAt = Date.now();

      this.active++;
      void item
        .task()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}

export const zakupkiHttpQueue = new ZakupkiHttpQueue(DEFAULT_CONCURRENCY);

let curlTlsLogged = false;

function curlBinary(): string {
  return process.platform === "win32" ? "curl.exe" : "curl";
}

function preferCurlForTls(): boolean {
  if (process.env.ZAKUPKI_USE_CURL === "0") return false;
  if (process.env.ZAKUPKI_USE_CURL === "1") return true;
  // На Windows Node часто не принимает российский CA из файла — curl работает стабильно.
  return process.platform === "win32" && Boolean(resolveZakupkiCaFile());
}

async function zakupkiFetchViaCurl(url: string, init?: RequestInit): Promise<Response> {
  const caFile = resolveZakupkiCaFile();
  if (!caFile) throw new Error("ZAKUPKI_CA_FILE не задан");

  if (!curlTlsLogged) {
    console.log(`[zakupki] TLS через ${curlBinary()} + ${caFile}`);
    curlTlsLogged = true;
  }

  const args = ["-sS", "-L", "--max-time", "120", "-w", "\n__ZAKUPKI_HTTP__%{http_code}"];
  args.push("--cacert", caFile);

  const headers = init?.headers;
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers as Record<string, string>)) {
      if (value != null) args.push("-H", `${key}: ${value}`);
    }
  }

  args.push(url);

  const { stdout } = await execFileAsync(curlBinary(), args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });

  const marker = Buffer.from("\n__ZAKUPKI_HTTP__");
  const idx = stdout.lastIndexOf(marker);
  if (idx < 0) throw new Error("curl: не удалось прочитать код ответа");

  const body = stdout.subarray(0, idx);
  const statusText = stdout.subarray(idx + marker.length).toString("utf8").trim();
  const status = parseInt(statusText, 10) || 0;

  return new Response(body, {
    status,
    headers: { "content-type": guessContentType(url) },
  });
}

function guessContentType(url: string): string {
  if (/\.(pdf|zip|rar|doc|docx|xls|xlsx)(\?|$)/i.test(url)) {
    return "application/octet-stream";
  }
  return "text/html; charset=utf-8";
}

async function zakupkiFetchInternal(url: string, init?: RequestInit): Promise<Response> {
  if (preferCurlForTls()) {
    try {
      return await zakupkiFetchViaCurl(url, init);
    } catch (e) {
      console.warn("[zakupki] curl не сработал, пробуем fetch:", e instanceof Error ? e.message : e);
    }
  }

  bootstrapZakupkiTls();
  return fetch(url, init);
}

/** Обёртка fetch с лимитом параллелизма */
export function zakupkiFetch(url: string, init?: RequestInit): Promise<Response> {
  return zakupkiHttpQueue.run(() => zakupkiFetchInternal(url, init));
}

/** Проверка TLS к zakupki (для диагностики). */
export async function probeZakupkiTls(): Promise<{ ok: boolean; via: string; status?: number; error?: string }> {
  const url = "https://zakupki.gov.ru/epz/main/public/home.html";
  try {
    if (preferCurlForTls()) {
      const res = await zakupkiFetchViaCurl(url);
      return { ok: res.ok, via: "curl", status: res.status };
    }
    bootstrapZakupkiTls();
    const res = await fetch(url, { redirect: "manual" });
    return { ok: res.ok || res.status === 302, via: "fetch", status: res.status };
  } catch (e) {
    return { ok: false, via: preferCurlForTls() ? "curl" : "fetch", error: e instanceof Error ? e.message : String(e) };
  }
}

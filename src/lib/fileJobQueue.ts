/**
 * Простая файловая очередь для dev (без Redis): Next пишет, worker читает.
 */

import { appendFile, mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

const QUEUE_DIR = path.join(process.cwd(), "data", "job-queues");

function queueFile(name: string): string {
  return path.join(QUEUE_DIR, `${name}.jsonl`);
}

async function readQueueLines(name: string): Promise<string[]> {
  try {
    const raw = await readFile(queueFile(name), "utf8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export { readQueueLines, queueFile };

export async function enqueueJsonLine(name: string, payload: unknown): Promise<void> {
  await mkdir(QUEUE_DIR, { recursive: true });
  await appendFile(queueFile(name), `${JSON.stringify(payload)}\n`, "utf8");
}

export async function dequeueJsonLine<T>(name: string): Promise<T | null> {
  const file = queueFile(name);
  await mkdir(QUEUE_DIR, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt++) {
    const lines = await readQueueLines(name);
    if (lines.length === 0) return null;

    const [first, ...rest] = lines;
    const tmp = `${file}.tmp.${process.pid}`;

    try {
      await writeFile(tmp, rest.length ? `${rest.join("\n")}\n` : "", "utf8");
      try {
        await rename(tmp, file);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // Windows: два worker-процесса читают одну очередь одновременно
        if (code === "ENOENT" || code === "EPERM" || code === "EBUSY") {
          await writeFile(file, rest.length ? `${rest.join("\n")}\n` : "", "utf8").catch(() => {});
          if (attempt < 3) continue;
        }
        throw e;
      }

      try {
        return JSON.parse(first) as T;
      } catch {
        return null;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "ENOENT" || code === "EPERM" || code === "EBUSY") && attempt < 3) {
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  return null;
}

export async function queueJsonLength(name: string): Promise<number> {
  return (await readQueueLines(name)).length;
}

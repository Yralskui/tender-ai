import { enqueueJsonLine, dequeueJsonLine, queueJsonLength, readQueueLines, queueFile } from "./fileJobQueue";
import { writeFile } from "fs/promises";

export type FeedCacheJob =
  | {
      type: "rebuild";
      companyId: string;
      full?: boolean;
      tenderIds?: string[];
      enqueuedAt: string;
    }
  | {
      type: "stale";
      companyId: string;
      catalogHash: string;
      enqueuedAt: string;
    }
  | {
      type: "global";
      tenderIds: string[];
      enqueuedAt: string;
    };

const QUEUE_NAME = "feed-cache";

export async function enqueueFeedCacheJob(
  job: Omit<FeedCacheJob, "enqueuedAt">
): Promise<void> {
  // Схлопываем подряд идущие partial-rebuild одной компании
  if (job.type === "rebuild" && !job.full && job.tenderIds?.length) {
    const lines = await readQueueLines(QUEUE_NAME);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]!) as FeedCacheJob;
        if (
          last.type === "rebuild" &&
          last.companyId === job.companyId &&
          !last.full &&
          last.tenderIds?.length
        ) {
          const merged = Array.from(new Set([...last.tenderIds, ...job.tenderIds]));
          lines[lines.length - 1] = JSON.stringify({
            ...last,
            tenderIds: merged,
            enqueuedAt: new Date().toISOString(),
          });
          await writeFile(queueFile(QUEUE_NAME), `${lines.join("\n")}\n`, "utf8");
          return;
        }
      } catch {
        /* append as usual */
      }
    }
  }

  // Схлопываем global x1 в один global xN
  if (job.type === "global" && job.tenderIds.length === 1) {
    const lines = await readQueueLines(QUEUE_NAME);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]!) as FeedCacheJob;
        if (last.type === "global" && last.tenderIds.length >= 1) {
          const merged = Array.from(new Set([...last.tenderIds, ...job.tenderIds]));
          lines[lines.length - 1] = JSON.stringify({
            ...last,
            tenderIds: merged,
            enqueuedAt: new Date().toISOString(),
          });
          await writeFile(queueFile(QUEUE_NAME), `${lines.join("\n")}\n`, "utf8");
          return;
        }
      } catch {
        /* append */
      }
    }
  }

  await enqueueJsonLine(QUEUE_NAME, { ...job, enqueuedAt: new Date().toISOString() });
}

export async function dequeueFeedCacheJob(): Promise<FeedCacheJob | null> {
  return dequeueJsonLine<FeedCacheJob>(QUEUE_NAME);
}

export async function feedCacheQueueLength(): Promise<number> {
  return queueJsonLength(QUEUE_NAME);
}

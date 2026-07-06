/**
 * Фоновый worker: синк ЕИС, разбор ТЗ, уведомления, rebuild кэша.
 * Next.js в проде только отдаёт страницы (BACKGROUND_JOBS_IN_NEXT=0).
 *
 *   npm run worker
 */

import { loadEnvFile } from "@/lib/loadEnvFile";
import { backgroundJobsInNext } from "@/lib/runtimeConfig";
import { bootstrapZakupkiTls, resolveZakupkiCaFile, zakupkiTlsDiagnostics } from "@/lib/zakupkiTls";
import { probeZakupkiTls } from "@/lib/zakupkiQueue";
import { runAutoSyncCycle } from "@/lib/autoSyncPipeline";
import { enrichPendingTendersInBackground, getTzEnrichmentState } from "@/lib/tzEnrichmentJob";
import { runNotificationMaintenance } from "@/lib/notificationJobs";
import { runTenderMaintenance } from "@/lib/tenderMaintenance";
import { prisma } from "@/lib/prisma";
import { invalidateTenderCountCache } from "@/lib/tenderQuery";
import { getAutoSyncIntervalMs } from "@/lib/autoSyncState";
import { dequeueDocumentAnalysisJob } from "@/lib/documentJobQueue";
import { processDocumentAnalysisJob } from "@/lib/documentAnalysisWorker";
import { dequeueFeedCacheJob } from "@/lib/feedCacheJobQueue";
import { processFeedCacheJob } from "@/lib/tenderFeedCache";

loadEnvFile();

process.env.WORKER_MODE = "1";
bootstrapZakupkiTls();

const TICK_MS = 60_000;
const NOTIFY_EVERY_TICKS = 30;

function log(msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const tail = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[worker] ${ts} ${msg}${tail}`);
}

async function waitForTzIdle(maxMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const s = getTzEnrichmentState();
    if (!s.running) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

let ticking = false;
let tickCount = 0;

async function tick() {
  if (ticking) {
    log("skip — предыдущий цикл ещё идёт");
    return;
  }
  ticking = true;
  tickCount += 1;

  try {
    const maintenance = await runTenderMaintenance(prisma);
    if (maintenance.expiredTendersDeleted > 0) {
      invalidateTenderCountCache().catch(() => {});
      log("maintenance", {
        expiredDeleted: maintenance.expiredTendersDeleted,
        cacheDirsRemoved: maintenance.expiredCacheDirsRemoved + maintenance.orphanCacheDirsRemoved,
      });
    }

    const sync = await runAutoSyncCycle({ force: false });
    if (!sync.skipped) {
      log("sync", { message: sync.message });
    }

    const tz = await enrichPendingTendersInBackground(20);
    if (tz.running) {
      await waitForTzIdle();
      log("tz-enrich", { message: getTzEnrichmentState().lastMessage });
    }

    if (tickCount % NOTIFY_EVERY_TICKS === 0) {
      const maint = await runNotificationMaintenance();
      log("notifications", maint);
    }
  } catch (e) {
    console.error("[worker] cycle error:", e);
  } finally {
    ticking = false;
  }
}

async function feedCacheLoop() {
  log("очередь feed-cache — слушаем");
  for (;;) {
    const job = await dequeueFeedCacheJob();
    if (!job) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const label =
      job.type === "rebuild"
        ? `rebuild ${job.companyId.slice(0, 8)}${job.full ? " full" : job.tenderIds?.length ? ` x${job.tenderIds.length}` : ""}`
        : job.type === "stale"
          ? `stale ${job.companyId.slice(0, 8)}`
          : `global x${job.tenderIds.length}`;
    const t0 = performance.now();
    const quietPartial =
      (job.type === "rebuild" && !job.full && (job.tenderIds?.length ?? 0) <= 1) ||
      (job.type === "global" && job.tenderIds.length === 1);
    if (!quietPartial) log("feed-cache start", { job: label });
    try {
      await processFeedCacheJob(job);
      const ms = Math.round(performance.now() - t0);
      if (quietPartial && ms < 200) continue;
      log("feed-cache done", { job: label, ms });
    } catch (e) {
      console.error("[worker] feed-cache error:", e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function documentAnalysisLoop() {
  log("очередь AI-документов — слушаем");
  for (;;) {
    const job = await dequeueDocumentAnalysisJob();
    if (!job) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    log("document-ai start", { id: job.documentId });
    const result = await processDocumentAnalysisJob(job);
    log("document-ai done", { id: job.documentId, ok: result.ok, message: result.message });
  }
}

async function main() {
  if (backgroundJobsInNext()) {
    console.warn(
      "[worker] BACKGROUND_JOBS_IN_NEXT не отключён — задайте BACKGROUND_JOBS_IN_NEXT=0 в .env для прода"
    );
  }

  const cdMin = Math.round(getAutoSyncIntervalMs() / 60_000);
  log(`старт (CD синка ~${cdMin} мин, тик каждую минуту)`);

  const ca = resolveZakupkiCaFile();
  if (ca) {
    log("zakupki TLS CA", { file: ca });
  } else {
    const diag = zakupkiTlsDiagnostics();
    log("zakupki TLS: сертификат не найден", {
      cwd: process.cwd(),
      repoRoot: diag.repoRoot,
      env: diag.envValue,
      defaultPath: diag.defaultPath,
      defaultExists: diag.defaultExists,
    });
  }

  const tlsProbe = await probeZakupkiTls();
  if (tlsProbe.ok) log("zakupki TLS OK", { via: tlsProbe.via, status: tlsProbe.status });
  else log("zakupki TLS FAIL", { via: tlsProbe.via, error: tlsProbe.error });

  void documentAnalysisLoop();
  void feedCacheLoop();
  await tick();
  setInterval(() => void tick(), TICK_MS);
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});

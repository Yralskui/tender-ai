import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildSyncFocusForCompany, runTenderSync, type SyncMode } from "@/lib/tenderSync";
import { notifyUsersAfterSync } from "@/lib/notificationJobs";
import { runSyncJobInBackground, isSyncRunning, getSyncJobState } from "@/lib/syncJob";
import { enrichPendingTendersInBackground } from "@/lib/tzEnrichmentJob";

export const maxDuration = 300;

async function executeSync(
  mode: SyncMode,
  limitParam: number,
  onProgress?: (msg: string) => void
) {
  let companyFocus = null;
  let searchQueries;
  const user = await getCurrentUser();
  if (user?.company) {
    const focus = await buildSyncFocusForCompany(user.company.id);
    companyFocus = focus.companyFocus;
    searchQueries = focus.searchQueries;
  }

  onProgress?.("Поиск и импорт с zakupki.gov.ru…");

  const result = await runTenderSync({
    mode,
    limit: limitParam,
    companyFocus,
    searchQueries,
    onProgress,
  });

  let notificationsSent = 0;
  if (mode === "smart" && result.createdTenderIds.length > 0) {
    onProgress?.("Уведомления…");
    const notifyResult = await notifyUsersAfterSync(result.createdTenderIds);
    notificationsSent = notifyResult.notified;
  }

  onProgress?.("Фоновый разбор ТЗ для остальных закупок…");
  void enrichPendingTendersInBackground(35);

  const message =
    mode === "catalog"
      ? `${result.message} Каталог обновлён.`
      : `${result.message}` +
        (notificationsSent > 0 ? ` Уведомлений: ${notificationsSent}.` : "") +
        " Разбор ТЗ продолжается в фоне.";

  return {
    ...result,
    notificationsSent,
    message,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modeParam = searchParams.get("mode");
  const mode: SyncMode = modeParam === "catalog" ? "catalog" : "smart";
  const defaultLimit = mode === "catalog" ? 1200 : 220;
  const limitParam = parseInt(searchParams.get("limit") || String(defaultLimit), 10);
  const background = searchParams.get("background") !== "false";

  try {
    if (background) {
      if (isSyncRunning()) {
        return NextResponse.json({
          success: true,
          background: true,
          alreadyRunning: true,
          job: getSyncJobState(),
        });
      }

      const job = await runSyncJobInBackground(async (onProgress) => {
        const result = await executeSync(mode, limitParam, onProgress);
        return {
          created: result.created,
          updated: result.updated,
          notificationsSent: result.notificationsSent,
          tzEnriched: result.tzEnriched,
          message: result.message,
        };
      });

      return NextResponse.json({
        success: true,
        background: true,
        job,
        message: "Синхронизация запущена в фоне — можно работать с документами и другими тендерами",
      });
    }

    const result = await executeSync(mode, limitParam);
    return NextResponse.json({
      success: true,
      background: false,
      mode: result.mode,
      purged: result.purged,
      created: result.created,
      updated: result.updated,
      notificationsSent: result.notificationsSent,
      scanned: result.scanned,
      imported: result.imported,
      tzEnriched: result.tzEnriched,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
      message: result.message,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

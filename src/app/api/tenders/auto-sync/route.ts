/**
 * Автообновление базы закупок (без кнопки).
 * POST — запустить цикл, если прошло достаточно времени.
 * GET — статус последнего цикла.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyCronSecret } from "@/lib/cronAuth";
import { runAutoSyncCycle, getAutoSyncStatus } from "@/lib/autoSyncPipeline";
import { formatAutoSyncAgo } from "@/lib/autoSyncState";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const isCron = verifyCronSecret(req);
  if (!isCron) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getAutoSyncStatus();
  return NextResponse.json({
    ...status,
    ago: formatAutoSyncAgo(status),
  });
}

export async function POST(req: NextRequest) {
  const isCron = verifyCronSecret(req);
  const user = isCron ? null : await getCurrentUser();
  if (!isCron && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true" || isCron;
  const mode = searchParams.get("mode") === "smart" ? "smart" : "catalog";
  const limit = parseInt(searchParams.get("limit") || (mode === "catalog" ? "800" : "220"), 10);

  try {
    const result = await runAutoSyncCycle({
      mode,
      limit,
      force,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[auto-sync]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

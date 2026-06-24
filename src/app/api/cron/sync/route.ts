/**
 * Автосинхронизация по расписанию + уборка просроченных.
 * GET /api/cron/sync?mode=catalog&limit=800
 * Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cronAuth";
import { runAutoSyncCycle } from "@/lib/autoSyncPipeline";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "smart" ? "smart" : "catalog";
  const limit = parseInt(searchParams.get("limit") || (mode === "catalog" ? "800" : "220"), 10);

  try {
    const result = await runAutoSyncCycle({
      mode,
      limit,
      force: true,
      skipNotifications: false,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/sync]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

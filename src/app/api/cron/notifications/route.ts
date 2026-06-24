/**
 * Периодические уведомления: дедлайны, документы, дайджесты.
 * GET /api/cron/notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cronAuth";
import { runNotificationMaintenance } from "@/lib/notificationJobs";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNotificationMaintenance();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/notifications]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

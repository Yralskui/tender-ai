import { NextResponse } from "next/server";
import { getSyncJobState } from "@/lib/syncJob";
import { getTzEnrichmentState } from "@/lib/tzEnrichmentJob";

export async function GET() {
  const sync = getSyncJobState();
  const tz = getTzEnrichmentState();
  return NextResponse.json({
    sync,
    tz,
    busy: sync?.phase !== "done" && sync?.phase !== "error" && sync?.phase !== "idle" && sync != null,
  });
}

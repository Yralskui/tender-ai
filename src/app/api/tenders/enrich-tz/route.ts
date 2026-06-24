import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enrichPendingTendersInBackground, getTzEnrichmentState } from "@/lib/tzEnrichmentJob";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = await enrichPendingTendersInBackground(30);
  return NextResponse.json({ success: true, ...state });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(getTzEnrichmentState());
}

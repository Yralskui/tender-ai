import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enrichTenderById } from "@/lib/tzEnrichmentJob";

export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await enrichTenderById(id);

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

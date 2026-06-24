import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  assignTenderLabel,
  listCompanyTenderLabels,
  listTenderLabelAssignments,
  removeTenderLabel,
} from "@/lib/tenderLabels";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tenderId } = await params;
  const [labels, assignments] = await Promise.all([
    listCompanyTenderLabels(user.company.id),
    listTenderLabelAssignments(user.company.id, tenderId),
  ]);

  return NextResponse.json({
    labels,
    assignedIds: assignments.map((a) => a.labelId),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tenderId } = await params;
  const body = await req.json().catch(() => ({}));
  const labelId = String(body.labelId || "");
  const action = String(body.action || "toggle");

  if (!labelId) return NextResponse.json({ error: "label_required" }, { status: 400 });

  try {
    if (action === "remove") {
      await removeTenderLabel(user.company.id, tenderId, labelId);
      return NextResponse.json({ ok: true, assigned: false });
    }

    const assignment = await assignTenderLabel(user.company.id, tenderId, labelId);
    return NextResponse.json({ ok: true, assigned: true, assignment });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 400 });
  }
}

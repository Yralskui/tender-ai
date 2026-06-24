import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteCompanyTenderLabel, updateTenderLabel } from "@/lib/tenderLabels";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const color = body.color !== undefined ? String(body.color).trim() : undefined;

  if (name !== undefined && (!name || name.length > 40)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "invalid_color" }, { status: 400 });
  }

  try {
    const label = await updateTenderLabel(user.company.id, id, { name, color });
    return NextResponse.json({ label });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteCompanyTenderLabel(user.company.id, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCompanyTenderLabels } from "@/lib/tenderLabels";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const labels = await listCompanyTenderLabels(user.company.id);
  return NextResponse.json({ labels });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const color = String(body.color || "#64748b").trim();

  if (!name || name.length > 40) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "invalid_color" }, { status: 400 });
  }

  const maxOrder = await prisma.tenderLabel.aggregate({
    where: { companyId: user.company.id },
    _max: { sortOrder: true },
  });

  try {
    const label = await prisma.tenderLabel.create({
      data: {
        companyId: user.company.id,
        name,
        color,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json({ label });
  } catch {
    return NextResponse.json({ error: "duplicate" }, { status: 409 });
  }
}

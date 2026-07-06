import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPromoCode } from "@/lib/promoCodes";

const VALID_PLANS: PlanId[] = ["pro", "team"];

function checkSupportKey(req: NextRequest): boolean {
  const key = process.env.SUPPORT_API_KEY?.trim();
  if (!key) return false;
  return req.headers.get("x-support-key") === key;
}

export async function GET(req: NextRequest) {
  if (!checkSupportKey(req)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { redemptions: true } } },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      code: c.code,
      discountPercent: c.discountPercent,
      kind: c.kind,
      note: c.note,
      isActive: c.isActive,
      maxTotalUses: c.maxTotalUses,
      expiresAt: c.expiresAt,
      usedCount: c._count.redemptions,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!checkSupportKey(req)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  try {
    const body = await req.json();

    const promo = await createPromoCode({
      code: body.code,
      discountPercent: Number(body.discountPercent),
      note: body.note,
      kind: body.kind,
      maxTotalUses: body.maxTotalUses != null ? Number(body.maxTotalUses) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return NextResponse.json({ success: true, promo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка создания";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { validatePromoCodeForUser } from "@/lib/promoCodes";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { code } = await req.json();
    const result = await validatePromoCodeForUser(String(code || ""), session.userId);

    if (!result.ok) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      code: result.code,
      discountPercent: result.discountPercent,
      label: result.label,
    });
  } catch (error) {
    console.error("Promo validate error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

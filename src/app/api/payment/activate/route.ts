import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PLAN_DURATIONS: Record<string, number> = {
  start: 30,
  pro: 30,
  team: 30,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { plan } = await req.json();
    if (!plan || !PLAN_DURATIONS[plan]) {
      return NextResponse.json({ error: "Неверный тариф" }, { status: 400 });
    }

    // В реальном проекте здесь будет проверка платежа через ЮKassa/Тинькофф API
    // Сейчас — активируем подписку напрямую (для демо)

    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + PLAN_DURATIONS[plan]);

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        isPaid: true,
        paidUntil,
        plan,
      },
    });

    return NextResponse.json({ success: true, plan, paidUntil });
  } catch (error) {
    console.error("Payment activation error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

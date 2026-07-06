import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BILLING_DAYS,
  finalCheckoutPrice,
  type BillingPeriod,
  type PlanId,
} from "@/lib/pricing";
import { redeemPromoCode } from "@/lib/promoCodes";

const VALID_PLANS = new Set<PlanId>(["pro", "team"]);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await req.json();
    const plan = body.plan as PlanId;
    const billingPeriod = (body.billingPeriod || "monthly") as BillingPeriod;
    const promoCode = typeof body.promoCode === "string" ? body.promoCode.trim() : "";

    if (!plan || !VALID_PLANS.has(plan)) {
      return NextResponse.json({ error: "Неверный тариф" }, { status: 400 });
    }
    if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
      return NextResponse.json({ error: "Неверный период оплаты" }, { status: 400 });
    }

    let promoDiscount = 0;
    let appliedPromo: string | null = null;

    if (promoCode) {
      const redeemed = await redeemPromoCode(promoCode, session.userId);
      if (!redeemed.ok) {
        return NextResponse.json({ error: redeemed.error }, { status: 400 });
      }
      promoDiscount = redeemed.discountPercent;
      appliedPromo = redeemed.code;
    }

    const pricing = finalCheckoutPrice(plan, billingPeriod, promoDiscount);

    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + BILLING_DAYS[billingPeriod]);

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        isPaid: true,
        paidUntil,
        plan: billingPeriod === "yearly" ? `${plan}_year` : plan,
      },
    });

    return NextResponse.json({
      success: true,
      plan,
      billingPeriod,
      promoCode: appliedPromo,
      amountPaid: pricing.totalAmount,
      paidUntil,
    });
  } catch (error) {
    console.error("Payment activation error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

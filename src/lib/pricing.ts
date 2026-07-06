export type BillingPeriod = "monthly" | "yearly";
export type PlanId = "pro" | "team";

export const PLAN_MONTHLY_PRICES: Record<PlanId, number> = {
  pro: 990,
  team: 1990,
};

export const YEARLY_DISCOUNT_PERCENT = 5;
export const YEARLY_MONTHS = 12;

export const BILLING_DAYS: Record<BillingPeriod, number> = {
  monthly: 30,
  yearly: 365,
};

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function basePriceForPeriod(plan: PlanId, period: BillingPeriod): number {
  const monthly = PLAN_MONTHLY_PRICES[plan];
  if (period === "monthly") return monthly;
  return Math.round(monthly * YEARLY_MONTHS * (1 - YEARLY_DISCOUNT_PERCENT / 100));
}

export function applyDiscount(amount: number, discountPercent: number): number {
  if (discountPercent <= 0) return amount;
  return Math.max(0, Math.round(amount * (1 - discountPercent / 100)));
}

export function finalCheckoutPrice(
  plan: PlanId,
  period: BillingPeriod,
  promoDiscountPercent = 0
): {
  baseAmount: number;
  yearlySavings: number;
  promoSavings: number;
  totalAmount: number;
  perMonthEquivalent: number;
} {
  const monthlyBase = PLAN_MONTHLY_PRICES[plan];
  const fullYearWithoutDiscount = monthlyBase * YEARLY_MONTHS;
  const baseAmount = basePriceForPeriod(plan, period);
  const yearlySavings =
    period === "yearly" ? fullYearWithoutDiscount - baseAmount : 0;
  const afterPromo = applyDiscount(baseAmount, promoDiscountPercent);
  const promoSavings = baseAmount - afterPromo;

  return {
    baseAmount,
    yearlySavings,
    promoSavings,
    totalAmount: afterPromo,
    perMonthEquivalent:
      period === "yearly"
        ? Math.round(afterPromo / YEARLY_MONTHS)
        : afterPromo,
  };
}

export function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU");
}

export function periodLabel(period: BillingPeriod): string {
  return period === "monthly" ? "мес" : "год";
}

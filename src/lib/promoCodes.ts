import { prisma } from "@/lib/prisma";
import { normalizePromoCode } from "@/lib/pricing";

export type PromoValidationResult =
  | { ok: true; code: string; discountPercent: number; label: string }
  | { ok: false; error: string };

export async function validatePromoCodeForUser(
  rawCode: string,
  userId: string
): Promise<PromoValidationResult> {
  const code = normalizePromoCode(rawCode);
  if (!code || code.length < 4) {
    return { ok: false, error: "Введите промокод" };
  }

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    return { ok: false, error: "Промокод не найден или недействителен" };
  }

  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { ok: false, error: "Срок действия промокода истёк" };
  }

  const alreadyUsed = await prisma.promoCodeRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
  });
  if (alreadyUsed) {
    return { ok: false, error: "Вы уже использовали этот промокод" };
  }

  if (promo.maxTotalUses != null) {
    const totalUses = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: promo.id },
    });
    if (totalUses >= promo.maxTotalUses) {
      return { ok: false, error: "Промокод исчерпан" };
    }
  }

  const kindLabels: Record<string, string> = {
    first_client: "Скидка для первого клиента",
    referral: "Пригласительный промокод",
    support: "Промокод от поддержки",
  };

  return {
    ok: true,
    code: promo.code,
    discountPercent: promo.discountPercent,
    label: kindLabels[promo.kind] || "Промокод",
  };
}

export async function redeemPromoCode(rawCode: string, userId: string): Promise<PromoValidationResult> {
  const code = normalizePromoCode(rawCode);
  const validation = await validatePromoCodeForUser(code, userId);
  if (!validation.ok) return validation;

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) {
    return { ok: false, error: "Промокод не найден" };
  }

  try {
    await prisma.promoCodeRedemption.create({
      data: { promoCodeId: promo.id, userId },
    });
  } catch {
    return { ok: false, error: "Вы уже использовали этот промокод" };
  }

  return validation;
}

export async function createPromoCode(input: {
  code: string;
  discountPercent: number;
  note?: string;
  kind?: string;
  maxTotalUses?: number | null;
  expiresAt?: Date | null;
}) {
  const code = normalizePromoCode(input.code);
  if (!code) throw new Error("Пустой код");
  if (input.discountPercent < 1 || input.discountPercent > 90) {
    throw new Error("Скидка должна быть от 1% до 90%");
  }

  return prisma.promoCode.create({
    data: {
      code,
      discountPercent: input.discountPercent,
      note: input.note?.trim() || null,
      kind: input.kind || "support",
      maxTotalUses: input.maxTotalUses ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

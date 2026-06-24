type UserWithSubscription = {
  trialEndsAt: Date;
  isPaid: boolean;
  paidUntil: Date | null;
  plan: string | null;
};

export function getAccessStatus(user: UserWithSubscription) {
  const now = new Date();

  // Активная оплаченная подписка
  if (user.isPaid && user.paidUntil && user.paidUntil > now) {
    return {
      hasAccess: true,
      type: "paid" as const,
      plan: user.plan,
      expiresAt: user.paidUntil,
      daysLeft: Math.ceil((user.paidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      trialDaysLeft: 0,
    };
  }

  // Активный пробный период
  if (user.trialEndsAt > now) {
    const daysLeft = Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      hasAccess: true,
      type: "trial" as const,
      plan: null,
      expiresAt: user.trialEndsAt,
      daysLeft,
      trialDaysLeft: daysLeft,
    };
  }

  // Доступ заблокирован
  return {
    hasAccess: false,
    type: "expired" as const,
    plan: null,
    expiresAt: null,
    daysLeft: 0,
    trialDaysLeft: 0,
  };
}

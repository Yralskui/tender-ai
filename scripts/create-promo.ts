/**
 * Создать промокод из командной строки (без curl).
 * npx tsx scripts/create-promo.ts VIP15 15 "для клиента"
 */
import { createPromoCode } from "../src/lib/promoCodes";
import { prisma } from "../src/lib/prisma";

async function main() {
  const code = process.argv[2];
  const discount = parseInt(process.argv[3] || "10", 10);
  const note = process.argv[4] || "";

  if (!code) {
    console.log("Usage: npx tsx scripts/create-promo.ts CODE DISCOUNT [note]");
    process.exit(1);
  }

  const promo = await createPromoCode({
    code,
    discountPercent: discount,
    note,
    kind: "support",
  });

  console.log(`✓ ${promo.code} −${promo.discountPercent}%`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

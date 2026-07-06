/**
 * Примеры промокодов для поддержки.
 * npx tsx scripts/seed-promo-codes.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { createPromoCode } from "../src/lib/promoCodes";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

const SEED = [
  {
    code: "FIRST10",
    discountPercent: 10,
    kind: "first_client",
    note: "Первый клиент — выдаёт поддержка",
  },
  {
    code: "INVITE10",
    discountPercent: 10,
    kind: "referral",
    note: "Пригласительный — один раз на аккаунт",
  },
];

async function main() {
  for (const item of SEED) {
    try {
      await createPromoCode(item);
      console.log(`✓ ${item.code} (−${item.discountPercent}%)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique/i.test(msg)) {
        console.log(`— ${item.code} уже есть`);
      } else {
        console.error(`✗ ${item.code}:`, msg);
      }
    }
  }
  console.log("\nСоздать свой код (поддержка):");
  console.log(
    'curl -X POST http://localhost:3000/api/support/promo-codes -H "x-support-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\\"code\\":\\"VIP15\\",\\"discountPercent\\":15,\\"kind\\":\\"support\\",\\"note\\":\\"для Иванова\\"}"'
  );
}

main().finally(() => prisma.$disconnect());

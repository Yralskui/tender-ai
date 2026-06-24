import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { importMedicalTendersFromEis } from "../src/lib/zakupkiImport";
import { purgeNonEisTenders } from "../src/lib/tenderQuery";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const purged = await purgeNonEisTenders(prisma);
  if (purged > 0) console.log(`🗑️  Удалено учебных: ${purged}`);

  console.log("Импорт реальных медзакупок с zakupki.gov.ru...");
  const result = await importMedicalTendersFromEis({
    limit: 25,
    recordsPerQuery: 8,
    concurrency: 3,
    onProgress: (m) => console.log(m),
  });

  let created = 0;
  let updated = 0;
  for (const t of result.tenders) {
    const existing = await prisma.tender.findUnique({ where: { externalId: t.externalId } });
    await prisma.tender.upsert({
      where: { externalId: t.externalId },
      update: {
        title: t.title,
        description: t.description,
        customerName: t.customerName,
        region: t.region,
        price: t.price,
        publishedAt: t.publishedAt,
        deadline: t.deadline,
        category: t.category,
        okvedCode: t.okvedCode,
        requirements: JSON.stringify(t.requirements),
        sourceUrl: t.sourceUrl,
        status: "active",
      },
      create: {
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        customerName: t.customerName,
        region: t.region,
        price: t.price,
        publishedAt: t.publishedAt,
        deadline: t.deadline,
        category: t.category,
        okvedCode: t.okvedCode,
        requirements: JSON.stringify(t.requirements),
        sourceUrl: t.sourceUrl,
        status: "active",
      },
    });
    if (existing) updated++;
    else created++;
  }

  console.log(`\n✅ Готово: ${created} новых, ${updated} обновлено, ошибок: ${result.errors.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

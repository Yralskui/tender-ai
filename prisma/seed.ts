/**
 * Seed: только реальные медзакупки с zakupki.gov.ru.
 * Учебные / сгенерированные тендеры не создаются.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { importMedicalTendersFromEis } from "../src/lib/zakupkiImport";
import { purgeNonEisTenders } from "../src/lib/tenderQuery";

const dbPath = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const removed = await purgeNonEisTenders(prisma);
  if (removed > 0) {
    console.log(`🗑️  Удалено учебных тендеров: ${removed}`);
  }

  const existing = await prisma.tender.count({
    where: { status: "active", requirements: { contains: '"importedFromEis":true' } },
  });

  if (existing >= 15) {
    console.log(`✅ В базе уже ${existing} реальных закупок с ЕИС — seed пропущен`);
    return;
  }

  console.log("📡 Загрузка медзакупок с zakupki.gov.ru...");
  const result = await importMedicalTendersFromEis({
    limit: 30,
    recordsPerQuery: 8,
    concurrency: 3,
    onProgress: (m) => console.log(`   ${m}`),
  });

  let created = 0;
  for (const t of result.tenders) {
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
    created++;
  }

  const total = await prisma.tender.count({
    where: { status: "active", requirements: { contains: '"importedFromEis":true' } },
  });
  console.log(`✅ Импортировано ${created} закупок. Всего реальных в базе: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

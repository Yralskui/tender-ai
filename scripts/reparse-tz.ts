/**
 * Обновить существующие тендеры — допарсить ТЗ из файлов zakupki.
 * npx tsx scripts/reparse-tz.ts [limit]
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport";
import { REAL_EIS_TENDER_WHERE } from "../src/lib/tenderQuery";

const limit = parseInt(process.argv[2] || "10", 10);
const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenders = await prisma.tender.findMany({
    where: REAL_EIS_TENDER_WHERE,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  let updated = 0;
  let withTz = 0;

  for (const t of tenders) {
    let noticeType = "ea20";
    try {
      noticeType = JSON.parse(t.requirements).noticeType || noticeType;
    } catch {}

    console.log(`\n→ ${t.externalId} (${noticeType})`);
    try {
      const details = await fetchNoticeDetails(t.externalId, noticeType, { parseTzFiles: true });
      const reqs = JSON.parse(t.requirements);
      const merged = {
        ...reqs,
        productSpecs: details.productSpecs,
        technicalAssignment: details.technicalAssignment,
        ktruCodes: details.ktruCodes,
        tzParsedFromFile: details.tzParsedFromFile === true,
        tzProducts: details.tzProducts || [],
        tzDocuments: (details.tzDocuments || []).map((d) => ({
          name: d.name,
          format: d.format,
          parsed: d.parsed,
          specCount: d.specCount,
          sizeBytes: d.sizeBytes,
        })),
        tzReparsedAt: new Date().toISOString(),
      };

      await prisma.tender.update({
        where: { id: t.id },
        data: { requirements: JSON.stringify(merged) },
      });
      updated++;
      if (details.tzParsedFromFile) {
        withTz++;
        console.log(`  ✓ ТЗ: ${details.productSpecs.length} характеристик`);
      } else {
        console.log(`  — ТЗ из файла не найдено (${details.productSpecs.length} из HTML)`);
      }
    } catch (e) {
      console.log(`  ✗ ${e}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ Обновлено ${updated}, с ТЗ из файла: ${withTz}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

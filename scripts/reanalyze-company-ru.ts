/**
 * Переразбор всех РУ документов компании после улучшения парсера.
 *   npx tsx scripts/reanalyze-company-ru.ts
 *   npx tsx scripts/reanalyze-company-ru.ts 027370199139
 */
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { analyzeDocument } from "../src/lib/aiAnalysis";
import { saveDocumentAnalysis } from "../src/lib/documentAnalysisJob";

async function main() {
  const inn = process.argv[2] || "027370199139";
  const company = await prisma.company.findFirst({ where: { inn } });
  if (!company) {
    console.error("Компания не найдена:", inn);
    process.exit(1);
  }

  const docs = await prisma.document.findMany({
    where: {
      companyId: company.id,
      OR: [
        { type: "medical_ru" },
        { name: { contains: "РУ" } },
        { name: { contains: "рзн" } },
        { name: { contains: "фср" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Компания: ${company.name}, РУ-документов: ${docs.length}\n`);

  for (const doc of docs) {
    const before = JSON.parse(doc.extractedData || "{}");
    const filePath = path.join(process.cwd(), "public", doc.fileUrl.replace(/^\//, ""));

    try {
      await readFile(filePath);
    } catch {
      console.log("SKIP (нет файла):", doc.name);
      continue;
    }

    console.log("—".repeat(60));
    console.log(doc.name.slice(0, 70));
    console.log("  было:", before.products?.length ?? 0, "поз.");

    const analysis = await analyzeDocument(doc.fileUrl, doc.name, "medical_ru", { mode: "full" });
    await saveDocumentAnalysis(doc.id, company.id, analysis);

    console.log("  стало:", analysis.productCount, "поз.");
    if (analysis.warning) console.log("  warn:", analysis.warning.slice(0, 100));
    for (const p of (analysis.products || []).slice(0, 6)) {
      console.log("   •", p.slice(0, 85));
    }
    if ((analysis.products?.length ?? 0) > 6) {
      console.log(`   … +${analysis.products!.length - 6}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

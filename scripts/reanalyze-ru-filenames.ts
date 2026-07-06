import { prisma } from "../src/lib/prisma";
import { parseRuFilenameCatalog } from "../src/lib/ruFilenameCatalog";
import { syncCatalogProductsToDb } from "../src/lib/catalogProductSync";
import { structuredItemFromRuLine } from "../src/lib/productDimensions";

async function main() {
  const needles = ["25693", "25657", "08335"];
  const docs = await prisma.document.findMany({
    where: {
      OR: needles.map((n) => ({ name: { contains: n } })),
    },
    include: { company: { select: { id: true, name: true } } },
  });

  console.log(`Found ${docs.length} RU documents\n`);

  for (const doc of docs) {
    const before = JSON.parse(doc.extractedData || "{}");
    const products = parseRuFilenameCatalog(doc.name);
    const catalogItems = products.map(structuredItemFromRuLine);
    const rzMatch = doc.name.match(/рзн[\s№#:_-]*(\d{4}[-_/\s]?\d+)/i);
    const fsrMatch = doc.name.match(/фср[\s№#:]*(\d{4}[\s/\-_]*\d+)/i);
    const number = rzMatch
      ? `РЗН ${rzMatch[1].replace(/\s+/g, "-")}`
      : fsrMatch
        ? `ФСР ${fsrMatch[1].replace(/\s+/g, "/")}`
        : before.number || "";

    const warning =
      products.length > 0
        ? "Скан не прочитан — каталог восстановлен из названия файла. Для точных размеров загрузите PDF со всеми страницами приложения к РУ."
        : before.warning;

    const summary = `Регистрационное удостоверение${number ? ` ${number}` : ""} на медицинские изделия. Изделия: ${products.slice(0, 5).join("; ")}.`;

    await syncCatalogProductsToDb(doc.id, doc.company.id, catalogItems);

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: "processed",
        type: "medical_ru",
        extractedData: JSON.stringify({
          ...before,
          docType: "medical_ru",
          docTypeLabel: "Регистрационное удостоверение (РУ) на мед. изделия",
          issuedBy: "Росздравнадзор",
          number,
          summary,
          isRelevant: true,
          warning,
          products,
          catalogItems,
          productCount: products.length,
          documentScope: "catalog",
          confidence: products.length > 0 ? 78 : before.confidence,
        }),
      },
    });

    console.log("—".repeat(50));
    console.log(doc.name);
    console.log("Before:", before.products);
    console.log("After:", products);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { name: true, inn: true } },
      _count: { select: { catalogProducts: true, supplierPrices: true } },
    },
  });

  console.log(`Total docs: ${docs.length}\n`);

  for (const d of docs) {
    let ex: Record<string, unknown> = {};
    try {
      ex = JSON.parse(d.extractedData || "{}");
    } catch {}

    console.log("=".repeat(60));
    console.log(`Name: ${d.name}`);
    console.log(`Type: ${d.type} | Status: ${d.status} | Created: ${d.createdAt.toISOString().slice(0, 10)}`);
    console.log(`Company: ${d.company.name} (ИНН ${d.company.inn})`);
    console.log(`isRelevant: ${ex.isRelevant}`);
    console.log(`aiDocType: ${ex.docType ?? ex.aiDocType ?? "—"}`);
    console.log(`ruNumber: ${ex.ruNumber ?? "—"}`);
    console.log(
      `products in JSON: ${Array.isArray(ex.products) ? ex.products.length : 0} | catalog DB: ${d._count.catalogProducts}`
    );
    console.log(`supplier prices DB: ${d._count.supplierPrices}`);
    if (ex.summary) console.log(`summary: ${String(ex.summary).slice(0, 250)}`);
    if (ex.warning) console.log(`warning: ${String(ex.warning).slice(0, 250)}`);
    if (ex.detectedContent) console.log(`detected: ${String(ex.detectedContent).slice(0, 180)}`);
    if (Array.isArray(ex.products) && ex.products.length > 0) {
      console.log(`sample products: ${ex.products.slice(0, 5).join(" | ")}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching, catalogProductsFromDocuments } from "../src/lib/documentQuery";
import { mapCompanyDocuments, matchProductToCatalog, analyzeMatch } from "../src/lib/matching";
import { computeTenderParticipation } from "../src/lib/tenderRanking";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const raw = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(raw);
  const cat = catalogProductsFromDocuments(raw);

  const capProducts = cat.filter((p) => /шапоч|берет|колпак|шарлот/i.test(p));
  console.log("Cap products in catalog:", capProducts.length);
  console.log("Sample:", capProducts.slice(0, 8).map((p) => p.slice(0, 80)));

  const tenders = await prisma.tender.findMany({
    where: {
      OR: [
        { title: { contains: "Шапочка хирургическая" } },
        { requirements: { contains: "14.12.30.190-00000177" } },
        { requirements: { contains: "Берет" } },
      ],
    },
    take: 5,
  });

  for (const t of tenders) {
    const r = JSON.parse(t.requirements) as Record<string, unknown>;
    const name = (r.tzProducts as string[])?.[0] || t.title;
    console.log("\n===", t.externalId, "===");
    console.log("Title:", t.title.slice(0, 90));
    console.log("tzProducts:", (r.tzProducts as string[])?.[0]?.slice(0, 80));
    console.log("match:", matchProductToCatalog(name, cat));
    const bundles = buildProcurementBundles(r, t.title, cat, docs.flatMap((d) => d.catalogItems || []));
    for (const b of bundles.slice(0, 1)) {
      console.log("bundle:", b.name.slice(0, 70), "→", b.match.status, b.match.matchedProduct?.slice(0, 50));
      for (const ch of b.characteristics) {
        console.log(`  char: ${ch.field}: ${ch.value || ch.label} → ${ch.match.status} | ${ch.match.note?.slice(0, 60)}`);
      }
    }
    const p = computeTenderParticipation(t, cat, docs.flatMap((d) => d.catalogItems || []), { parsedReqs: r, hasCatalog: true });
    console.log("forecast:", p.forecast.chancePercent + "%", p.ruMatched, "/", p.ruTotal);
  }

  const pricelist = await prisma.document.findFirst({
    where: { name: { contains: "спец.цена" } },
  });
  if (pricelist) {
    const ex = JSON.parse(pricelist.extractedData || "{}");
    console.log("\n=== PRICELIST DOC ===");
    console.log("name:", pricelist.name);
    console.log("type:", pricelist.type);
    console.log("status:", pricelist.status);
    console.log("isRelevant:", ex.isRelevant);
    console.log("docType:", ex.docType);
    console.log("warning:", ex.warning?.slice(0, 120));
    console.log("summary:", ex.summary?.slice(0, 120));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

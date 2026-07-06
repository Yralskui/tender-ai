import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";
import { computeTenderParticipation } from "../src/lib/tenderRanking";
import { buildProcurementBundles, blockProcurementBundleMatches } from "../src/lib/tzProcurementBundles";

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true, inn: true } });
  console.log("Companies:", companies);

  const tender = await prisma.tender.findFirst({
    where: { externalId: "0127200000226003936" },
  });
  if (!tender) {
    console.log("tender not found");
    return;
  }
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;

  for (const c of companies) {
    const raw = await loadDocumentsForMatching(c.id);
    const docs = mapCompanyDocuments(raw);
    const cat = docs.filter((d) => d.isRelevant).flatMap((d) => d.products || []);
    const struct = docs.flatMap((d) => d.catalogItems || []);
    if (cat.length === 0) continue;
    console.log("\n=== Company", c.name, "catalog", cat.length, "===");
    const part = computeTenderParticipation(tender, cat, struct, {
      parsedReqs: reqs,
      hasCatalog: true,
    });
    console.log("participation:", {
      mismatch: part.nomenclatureMismatch,
      ru: `${part.ruMatched}/${part.ruTotal}`,
      blocked: part.familyBlocked,
      forecast: part.forecast.chancePercent,
      nomRows: part.nomRows.map((r) => `${r.status}:${r.requested.slice(0, 40)}`),
    });
    let bundles = buildProcurementBundles(reqs, tender.title, cat, struct);
    if (part.nomenclatureMismatch && part.ruMatched + part.ruPartial === 0) {
      console.log("BLOCKING BUNDLES");
      bundles = blockProcurementBundleMatches(bundles, "blocked");
    }
    const b = bundles[0];
    if (b) {
      console.log("bundle:", b.match.status, b.match.matchedProduct?.slice(0, 50));
      for (const ch of b.characteristics.slice(0, 5)) {
        console.log(" ", ch.field, "->", ch.match.status);
      }
    }
  }

  const pricelists = await prisma.document.findMany({
    where: { name: { contains: "спец.цена" } },
    include: { company: true },
  });
  for (const p of pricelists) {
    const ex = JSON.parse(p.extractedData || "{}");
    console.log("\nPricelist:", p.company?.name, p.type, p.status, p.name);
    console.log("  isRelevant:", ex.isRelevant, "docType:", ex.docType);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

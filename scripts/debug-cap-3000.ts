import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";
import { computeTenderParticipation } from "../src/lib/tenderRanking";
import { buildProcurementBundles, blockProcurementBundleMatches } from "../src/lib/tzProcurementBundles";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const raw = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(raw);
  const cat = docs.filter((d) => d.isRelevant).flatMap((d) => d.products || []);
  const struct = docs.flatMap((d) => d.catalogItems || []);

  const tender = await prisma.tender.findFirst({ where: { externalId: "0333300018926000117" } });
  if (!tender) return;
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;

  const part = computeTenderParticipation(tender, cat, struct, {
    parsedReqs: reqs,
    hasCatalog: true,
  });
  console.log("participation:", part);

  let bundles = buildProcurementBundles(reqs, tender.title, cat, struct);
  if (part.nomenclatureMismatch && part.ruMatched + part.ruPartial === 0) {
    bundles = blockProcurementBundleMatches(bundles, "blocked");
  }
  for (const b of bundles) {
    console.log("\nbundle", b.position, b.match.status, b.name.slice(0, 60));
    console.log("matched:", b.match.matchedProduct);
    for (const ch of b.characteristics) {
      console.log(`  ${ch.field}: ${ch.value} -> ${ch.match.status}`);
    }
  }

  const cached = await prisma.tenderMatch.findFirst({
    where: { tenderId: tender.id, companyId: company.id },
  });
  if (cached) {
    console.log("\nCACHE:", cached.ruMatched, cached.ruTotal, cached.chancePercent, cached.matchLevel);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

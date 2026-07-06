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

  const tender = await prisma.tender.findFirst({ where: { externalId: "0318200014326000169" } });
  if (!tender) return;
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;

  const part = computeTenderParticipation(tender, cat, struct, {
    parsedReqs: reqs,
    hasCatalog: true,
  });
  console.log("mismatch:", part.nomenclatureMismatch, "ru:", part.ruMatched, part.ruPartial, part.ruMissing, part.ruTotal);

  let bundles = buildProcurementBundles(reqs, tender.title, cat, struct);
  if (part.nomenclatureMismatch && part.ruMatched + part.ruPartial === 0) {
    console.log("BLOCKING");
    bundles = blockProcurementBundleMatches(bundles, "blocked");
  }

  const cap = bundles.find((b) => /шапоч/i.test(b.name));
  if (cap) {
    console.log("\nCAP bundle:", cap.position, cap.match.status, cap.quantityText);
    console.log("matched:", cap.match.matchedProduct);
    for (const ch of cap.characteristics) {
      console.log(`  ${ch.field}: ${ch.value} -> ${ch.match.status} | ${ch.match.note?.slice(0, 50)}`);
    }
  } else {
    console.log("bundles:", bundles.map((b) => `${b.position} ${b.match.status} ${b.name.slice(0, 40)}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "../src/lib/catalogProductSync";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { computeTenderParticipation } from "../src/lib/tenderRanking";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const raw = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(raw);
  const catalogRows = await loadCompanyCatalogProducts(company.id);
  const merged = mergeCompanyCatalogSources({ catalogRows, docsForMatching: docs });
  console.log("merged catalog:", merged.catalogProducts.length, "caps:", merged.catalogProducts.filter((p) => /шапоч|берет/i.test(p)).length);

  const tender = await prisma.tender.findFirst({ where: { externalId: "0318200014326000169" } });
  if (!tender) return;
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;
  const part = computeTenderParticipation(tender, merged.catalogProducts, merged.catalogStructured, {
    parsedReqs: reqs,
    hasCatalog: true,
  });
  const bundles = buildProcurementBundles(reqs, tender.title, merged.catalogProducts, merged.catalogStructured);
  const cap = bundles.find((b) => /шапоч/i.test(b.name));
  console.log("participation ru:", part.ruMatched, "/", part.ruTotal);
  console.log("cap bundle:", cap?.match.status, cap?.match.matchedProduct?.slice(0, 60));
  for (const ch of cap?.characteristics || []) {
    console.log(" ", ch.field, "->", ch.match.status);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

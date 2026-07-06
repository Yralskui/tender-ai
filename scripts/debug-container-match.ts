import { prisma } from "../src/lib/prisma";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { mergeCompanyCatalogSources, loadCompanyCatalogProducts } from "../src/lib/catalogProductSync";
import { mapCompanyDocuments } from "../src/lib/matching";
import { matchProductToCatalog } from "../src/lib/matching";

const externalId = process.argv[2] || "0318300053126000331";

async function main() {
  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (!tender) {
    console.log("not found");
    return;
  }
  const reqs = JSON.parse(tender.requirements || "{}");
  console.log("Tender:", externalId, tender.title);

  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;

  const catalogRows = await loadCompanyCatalogProducts(company.id);
  const docs = await prisma.document.findMany({ where: { companyId: company.id } });
  const merged = mergeCompanyCatalogSources({
    catalogRows,
    docsForMatching: mapCompanyDocuments(docs),
  });

  const testName = "Контейнер для стерилизации";
  const m = matchProductToCatalog(testName, merged.catalogProducts, merged.catalogStructured);
  console.log("\nDirect match:", m);

  const film = merged.catalogProducts.filter((p) => /плёнк|пленк/i.test(p));
  const container = merged.catalogProducts.filter((p) => /контейнер/i.test(p));
  console.log("\nCatalog film:", film.slice(0, 5));
  console.log("Catalog container:", container.slice(0, 5));

  const bundles = buildProcurementBundles(reqs, tender.title, merged.catalogProducts, merged.catalogStructured);
  for (const b of bundles.slice(0, 8)) {
    console.log(`\n#${b.position} ${b.name.slice(0, 70)}`);
    console.log(`  match: ${b.match.status} -> ${b.match.matchedProduct} | ${b.match.note}`);
    console.log(`  chars: ${b.characteristics.length}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

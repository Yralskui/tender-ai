import { prisma } from "../src/lib/prisma";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "../src/lib/catalogProductSync";
import { mapCompanyDocuments } from "../src/lib/matching";

async function main() {
  const externalId = process.argv[2] || "0341300023626000340";
  const tender = await prisma.tender.findFirst({
    where: { OR: [{ externalId }, { title: { contains: "белья" } }] },
    orderBy: { updatedAt: "desc" },
  });
  if (!tender) {
    console.log("tender not found");
    return;
  }

  const reqs = JSON.parse(tender.requirements || "{}");
  console.log("Tender:", tender.externalId, tender.title?.slice(0, 80));
  console.log("tzParsedFromFile:", reqs.tzParsedFromFile);
  console.log("productSpecs:", reqs.productSpecs?.length ?? 0);
  console.log("tzProducts:", reqs.tzProducts?.length ?? 0);
  console.log("\n--- productSpecs ---");
  for (const [i, s] of (reqs.productSpecs || []).entries()) {
    console.log(`${i + 1}. ${s}`);
  }

  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;

  const catalogRows = await loadCompanyCatalogProducts(company.id);
  const docs = await prisma.document.findMany({ where: { companyId: company.id } });
  const merged = mergeCompanyCatalogSources({
    catalogRows,
    docsForMatching: mapCompanyDocuments(docs),
  });

  const bundles = buildProcurementBundles(
    reqs,
    tender.title || undefined,
    merged.catalogProducts,
    merged.catalogStructured
  );

  console.log("\n--- bundles ---");
  for (const b of bundles) {
    console.log(`#${b.position} ${b.name} (${b.characteristics.length} chars)`);
    for (const c of b.characteristics) {
      console.log(`  - ${c.label} [${c.match.status}]`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

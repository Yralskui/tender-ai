import { prisma } from "../src/lib/prisma";
import { mergeCompanyCatalogSources, loadCompanyCatalogProducts } from "../src/lib/catalogProductSync";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { matchProductToCatalog, mapCompanyDocuments } from "../src/lib/matching";
import { parseSterilityPreference } from "../src/lib/productFamilies";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";

async function main() {
  const t =
    (await prisma.tender.findFirst({ where: { requirements: { contains: "14.12.30.190-00000019" } } })) ||
    (await prisma.tender.findFirst({ where: { title: { contains: "набор белья" } } }));
  if (!t) {
    const multi = await prisma.tender.findMany({
      where: { requirements: { contains: "00000019" } },
      take: 5,
    });
    console.log(
      "candidates",
      multi.map((x) => x.externalId)
    );
    console.log("tender not found");
    return;
  }
  console.log("id", t.externalId);
  console.log("title", t.title?.slice(0, 120));

  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  const raw = await loadDocumentsForMatching(company!.id);
  const docs = mapCompanyDocuments(raw);
  const rows = await loadCompanyCatalogProducts(company!.id);
  const merged = mergeCompanyCatalogSources({ catalogRows: rows, docsForMatching: docs });

  const name =
    "Набор белья для осмотра/хирургических процедур, нестерильный, одноразового использования";
  const m = matchProductToCatalog(name, merged.catalogProducts, merged.catalogStructured);
  console.log("\nproduct match:", m);

  const gownOnly = matchProductToCatalog(
    name,
    ["халат медицинский процедурный одноразовый стерильный тип 1"],
    merged.catalogStructured
  );
  console.log("gown-only pool:", gownOnly);

  console.log("\ncatalog linen/gown:");
  for (const p of merged.catalogProducts) {
    if (/бель|халат/i.test(p)) {
      console.log(" ", p.slice(0, 100), "|", parseSterilityPreference(p));
    }
  }

  const reqs = JSON.parse(t.requirements);
  const bundles = buildProcurementBundles(reqs, t.title, merged.catalogProducts, merged.catalogStructured);
  for (const b of bundles) {
    console.log(`\n#${b.position} ${b.name?.slice(0, 90)}`);
    console.log("  match:", b.match.status, b.match.matchedProduct?.slice(0, 80));
  }
}

main().finally(() => prisma.$disconnect());

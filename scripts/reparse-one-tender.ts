import { prisma } from "../src/lib/prisma";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { mergeCompanyCatalogSources } from "../src/lib/catalogProductSync";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";
import { loadCompanyCatalogProducts } from "../src/lib/catalogProductSync";

async function main() {
  const externalId = process.argv[2] || "0335300031026000059";
  const details = await fetchNoticeDetails(externalId, "ea20", { parseTzFiles: true });
  console.log("products:", details.tzProducts);
  console.log("specs:", details.productSpecs.length);
  console.log("tz doc parsed:", details.tzDocuments?.find((d) => /описание/i.test(d.name)));

  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  const raw = await loadDocumentsForMatching(company!.id);
  const docs = mapCompanyDocuments(raw);
  const rows = await loadCompanyCatalogProducts(company!.id);
  const merged = mergeCompanyCatalogSources({ catalogRows: rows, docsForMatching: docs });

  const bundles = buildProcurementBundles(
    {
      tzProducts: details.tzProducts,
      productSpecs: details.productSpecs,
      tzVolumes: details.tzVolumes,
    },
    details.title,
    merged.catalogProducts,
    merged.catalogStructured
  );

  for (const b of bundles) {
    console.log(`\n#${b.position} ${b.name} (${b.characteristics.length} chars) ${b.quantityText || ""}`);
    for (const ch of b.characteristics) console.log(" ", ch.field || ch.label, ":", ch.value || "");
  }

  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (tender) {
    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        requirements: JSON.stringify({
          ...JSON.parse(tender.requirements),
          productSpecs: details.productSpecs,
          tzProducts: details.tzProducts,
          tzVolumes: details.tzVolumes,
          tzParsedFromFile: details.tzParsedFromFile,
          tzReparsedAt: new Date().toISOString(),
        }),
      },
    });
    console.log("\nDB updated");
  }
}

main().finally(() => prisma.$disconnect());

import { fetchNoticeDetails } from "../src/lib/zakupkiImport";
import { prisma } from "../src/lib/prisma";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";

async function main() {
  const externalId = process.argv[2] || "0372200041826000050";
  console.log("Fetching", externalId, "...");
  const details = await fetchNoticeDetails(externalId, "ea20", { parseTzFiles: true });
  console.log("tzParsedFromFile:", details.tzParsedFromFile);
  console.log("tzProducts:", details.tzProducts);
  console.log("tzVolumes:", details.tzVolumes);
  console.log("productSpecs:", details.productSpecs.length);
  console.log("tzDocuments:", details.tzDocuments?.map((d) => `${d.name} parsed=${d.parsed} specs=${d.specCount}`));

  const pos2specs = details.productSpecs.filter((s) => /поз\.?\s*2|00000009/i.test(s));
  console.log("\npos2 related specs:", pos2specs);

  const bundles = buildProcurementBundles(
    {
      tzProducts: details.tzProducts,
      productSpecs: details.productSpecs,
      tzVolumes: details.tzVolumes,
    },
    "Поставка шапочек хирургических и фартуков гигиенических одноразового использования",
    ["Шапочка медицинская-КФ СМЗ", "Фартук гигиенический"],
    []
  );
  for (const b of bundles) {
    console.log(`\n#${b.position} ${b.name} (${b.characteristics.length} chars)`);
    for (const ch of b.characteristics) console.log(" ", ch.field, ch.value);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

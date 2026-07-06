import { prisma } from "../src/lib/prisma";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser";

const EXTERNAL_ID = "0335300031026000059";

async function main() {
  const tender = await prisma.tender.findFirst({ where: { externalId: EXTERNAL_ID } });
  if (!tender) {
    console.log("not in DB");
    return;
  }
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;
  console.log("title:", tender.title);
  console.log("tzParsed:", reqs.tzParsedFromFile);
  console.log("tzProducts:", reqs.tzProducts);
  console.log("tzVolumes:", reqs.tzVolumes);
  console.log("specs:", (reqs.productSpecs as string[])?.length);
  const specs = (reqs.productSpecs as string[]) || [];
  for (const s of specs.slice(0, 20)) console.log(" ", s);

  const bundles = buildProcurementBundles(reqs, tender.title, [], []);
  for (const b of bundles) {
    console.log(`\nbundle #${b.position}: ${b.name} | chars: ${b.characteristics.length}`);
    for (const ch of b.characteristics) console.log(" ", ch.field, ch.value?.slice(0, 50));
  }

  console.log("\n--- FETCH ---");
  const details = await fetchNoticeDetails(EXTERNAL_ID, "ea20", { parseTzFiles: true });
  console.log("parsed:", details.tzParsedFromFile, "specs:", details.productSpecs.length);
  console.log("products:", details.tzProducts);
  console.log("docs:", details.tzDocuments?.map((d) => `${d.name} parsed=${d.parsed} n=${d.specCount}`));

  const url = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${EXTERNAL_ID}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const eis = parseEisKtruCatalogHtml(await res.text());
  for (const b of eis?.productBlocks || []) {
    console.log(`EIS pos ${b.position} ${b.code} name=${b.name?.slice(0, 80)} chars=${b.characteristics.length}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

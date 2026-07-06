import { prisma } from "../src/lib/prisma";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { bundleStats } from "../src/lib/tzProcurementBundles";

const ids = process.argv.slice(2);
const fallbackIds = [
  "0124200000626004474",
  "0340200003326008041",
  "0335300031026000059",
  "0373200045226001053",
];

async function main() {
  const targets = ids.length > 0 ? ids : fallbackIds;

  for (const externalId of targets) {
    console.log("\n" + "=".repeat(60));
    console.log("Tender:", externalId);

    try {
      const details = await fetchNoticeDetails(externalId, "ea20", { parseTzFiles: true });
      const bundles = buildProcurementBundles(
        {
          tzProducts: details.tzProducts,
          productSpecs: details.productSpecs,
          tzVolumes: details.tzVolumes,
          technicalAssignment: details.technicalAssignment,
        },
        details.title
      );
      const stats = bundleStats(bundles);
      console.log("title:", details.title?.slice(0, 70));
      console.log(
        "parsed:",
        details.tzParsedFromFile,
        "| products:",
        stats.productCount,
        "| chars:",
        stats.charCount,
        "| specs:",
        details.productSpecs.length
      );
      for (const b of bundles) {
        console.log(`  #${b.position} ${b.name.slice(0, 72)} (${b.characteristics.length} chars)`);
      }

      const tender = await prisma.tender.findFirst({ where: { externalId } });
      if (tender) {
        await prisma.tender.update({
          where: { id: tender.id },
          data: {
            requirements: JSON.stringify({
              ...JSON.parse(tender.requirements || "{}"),
              productSpecs: details.productSpecs,
              tzProducts: details.tzProducts,
              tzVolumes: details.tzVolumes,
              tzParsedFromFile: details.tzParsedFromFile,
              tzReparsedAt: new Date().toISOString(),
            }),
          },
        });
      }
    } catch (e) {
      console.error("FAILED:", e instanceof Error ? e.message : e);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

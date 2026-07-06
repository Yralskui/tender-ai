import { prisma } from "../src/lib/prisma";
import { enrichTenderById } from "../src/lib/tzEnrichmentJob";

async function main() {
  const externalId = process.argv[2] || "0368200011926000098";
  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (!tender) {
    console.error("not found");
    process.exit(1);
  }
  const result = await enrichTenderById(tender.id, { skipFeedCache: true });
  console.log(result.message);
  console.log("specs:", result.specCount, "products:", result.productCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

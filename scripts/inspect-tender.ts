import { prisma } from "../src/lib/prisma";

const externalId = process.argv[2] || "0124200000626004474";

async function main() {
  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (!tender) {
    console.log("NOT FOUND:", externalId);
    return;
  }
  const r = JSON.parse(tender.requirements || "{}");
  console.log("id:", tender.id);
  console.log("title:", tender.title);
  console.log("tzParsedFromFile:", r.tzParsedFromFile);
  console.log("specs:", r.productSpecs?.length ?? 0);
  console.log("products:", r.tzProducts?.length ?? 0);
  console.log("volumes:", r.tzVolumes?.length ?? 0);
  console.log("\n--- productSpecs ---");
  for (const [i, s] of (r.productSpecs || []).entries()) {
    console.log(`${i + 1}. ${s}`);
  }
  console.log("\n--- tzProducts ---");
  for (const [i, s] of (r.tzProducts || []).entries()) {
    console.log(`${i + 1}. ${s}`);
  }
  console.log("\n--- tzVolumes ---");
  for (const v of r.tzVolumes || []) {
    console.log(JSON.stringify(v));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";

async function main() {
  const externalId = process.argv[2] || "0373100015826000370";
  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (!tender) {
    console.log("NOT FOUND");
    return;
  }
  const r = JSON.parse(tender.requirements || "{}");
  console.log("id:", tender.id);
  console.log("title:", tender.title);
  console.log("price:", tender.price);
  console.log("tzParsedFromFile:", r.tzParsedFromFile);
  console.log("tzProducts:", r.tzProducts);
  console.log("tzVolumes:", JSON.stringify(r.tzVolumes, null, 2));
  console.log("\nproductSpecs:", r.productSpecs?.length);
  for (const [i, s] of (r.productSpecs || []).entries()) {
    console.log(`${i + 1}. ${s}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

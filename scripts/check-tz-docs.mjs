import { prisma } from "../src/lib/prisma.ts";

const tenderId = process.argv[2] || "cmqg6dzy800043gviy651a1ai";
const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
if (!tender) {
  console.log("not found");
  process.exit(1);
}
const req = JSON.parse(tender.requirements);
const docs = req.tzDocuments || [];
console.log(`externalId: ${tender.externalId}`);
console.log(`documents: ${docs.length}`);
for (const d of docs) {
  console.log(` - ${d.name} | parsed=${d.parsed} | cached=${Boolean(d.cachedPath)}`);
}

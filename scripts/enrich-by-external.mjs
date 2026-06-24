import { prisma } from "../src/lib/prisma.ts";

const externalId = process.argv[2];
if (!externalId) {
  console.log("usage: check-tz-docs.mjs [tenderId] OR enrich-by-external.mjs externalId");
  process.exit(1);
}

const tender = await prisma.tender.findFirst({ where: { externalId } });
if (!tender) {
  console.log("tender not found:", externalId);
  process.exit(1);
}

const { enrichTenderById } = await import("../src/lib/tzEnrichmentJob.ts");
const result = await enrichTenderById(tender.id);
console.log("enrich:", result.message);

const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
const req = JSON.parse(fresh.requirements);
const docs = req.tzDocuments || [];
console.log(`documents: ${docs.length}`);
for (const d of docs) console.log(` - ${d.name}`);

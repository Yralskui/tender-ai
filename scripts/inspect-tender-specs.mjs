import { prisma } from "../src/lib/prisma.ts";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles.ts";
import { summarizeTechnicalAssignment, extractProcurementItems, extractCharacteristicSpecs } from "../src/lib/tenderPresentation.ts";

const externalId = process.argv[2] || "0373100059326000406";
const tender = await prisma.tender.findFirst({ where: { externalId } });
if (!tender) {
  console.log("not found");
  process.exit(1);
}
const req = JSON.parse(tender.requirements);
console.log("tzProducts:", req.tzProducts);
console.log("spec count:", req.productSpecs?.length);
console.log("\n--- first 15 specs ---");
for (const s of (req.productSpecs || []).slice(0, 15)) console.log(s);
console.log("\n--- last 5 specs ---");
for (const s of (req.productSpecs || []).slice(-5)) console.log(s);

console.log("tzVolumes:", req.tzVolumes);
console.log("volume specs:", (req.productSpecs || []).filter((s) => /объём/i.test(s)));

console.log("summary:", summarizeTechnicalAssignment(req));
const items = extractProcurementItems(req, tender.title);
const chars = extractCharacteristicSpecs(req);
console.log("\nprocurement items:", items.length, items.map((i) => i.name));
console.log("characteristic specs:", chars.length);

const bundles = buildProcurementBundles(req, tender.title, [], []);
console.log("\nbundles:", bundles.length);
for (const b of bundles) {
  console.log(`#${b.position} ${b.name} — ${b.characteristics.length} chars`);
  for (const c of b.characteristics.slice(0, 8)) console.log("  -", c.label);
  if (b.characteristics.length > 8) console.log(`  ... +${b.characteristics.length - 8}`);
}

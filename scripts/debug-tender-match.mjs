import { createRequire } from "module";
import { matchProductToCatalog, analyzeMatch, mapCompanyDocuments } from "../src/lib/matching.ts";
import { buildNomenclatureMatchTable, blockNomenclatureMatches, extractProcurementItems, computeParticipationForecast, resolveRuMatchBlock } from "../src/lib/tenderPresentation.ts";
import { normalizeStoredRequirements } from "../src/lib/textNormalize.ts";
import { isNonMedicalConsumerTextileTender, titleConflictsWithTzProducts } from "../src/lib/tzSanitizer.ts";

const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");

const externalId = process.argv[2] || "0862600014726000002";
const t = db.prepare("SELECT * FROM Tender WHERE externalId = ?").get(externalId);
if (!t) {
  console.log("not found");
  process.exit(1);
}

const r = normalizeStoredRequirements(JSON.parse(t.requirements));
const co = db.prepare("SELECT * FROM Company LIMIT 1").get();
const docs = db.prepare("SELECT type,name,extractedData FROM Document WHERE companyId = ?").all(co.id);
const mapped = mapCompanyDocuments(docs);
const company = {
  okvedCodes: JSON.parse(co.okvedCodes || "[]"),
  revenue: co.revenue,
  region: co.region,
  description: co.description,
};

console.log("title:", t.title);
console.log("tzProduct:", r.tzProducts?.[0]);
console.log("titleConflict:", titleConflictsWithTzProducts(t.title, r.tzProducts || []));

const analysis = analyzeMatch(mapped, company, r, t.okvedCode, t.region, {
  category: t.category,
  title: t.title,
});
console.log("nomenclatureMismatch:", analysis.nomenclatureMismatch);
console.log("blockers:", analysis.blockers);
console.log("catalogProducts:", analysis.catalogProducts.length);

const items = extractProcurementItems(r, t.title);
let rows = buildNomenclatureMatchTable(items, analysis.catalogProducts);
const ruBlock = resolveRuMatchBlock({
  tenderTitle: t.title,
  tzProducts: r.tzProducts,
  nomenclatureMismatch: analysis.nomenclatureMismatch,
});
if (ruBlock.blocked) rows = blockNomenclatureMatches(rows, ruBlock.reason);
console.log("ruBlock:", ruBlock);
console.log("items:", items.map((i) => i.name));
console.log("rows:", rows);

const m = matchProductToCatalog(r.tzProducts[0], analysis.catalogProducts);
console.log("direct match:", m);

const forecast = computeParticipationForecast(
  analysis.score,
  rows,
  analysis.blockers.length > 0,
  analysis.catalogProducts.length > 0,
  { nomenclatureMismatch: analysis.nomenclatureMismatch || ruBlock.blocked }
);
console.log("forecast:", forecast);

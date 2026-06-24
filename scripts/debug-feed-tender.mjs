import { createRequire } from "module";
import { mapCompanyDocuments, analyzeMatch } from "../src/lib/matching.ts";
import {
  buildNomenclatureMatchTable,
  computeParticipationForecast,
  extractProcurementItems,
  blockNomenclatureMatches,
  resolveRuMatchBlock,
} from "../src/lib/tenderPresentation.ts";
import { rankTenderForFeed } from "../src/lib/tenderRanking.ts";
import { buildCompanyFocus } from "../src/lib/companyFocus.ts";
import { normalizeStoredRequirements } from "../src/lib/textNormalize.ts";
import { catalogRowsToStructured, loadCompanyCatalogProducts } from "../src/lib/catalogProductSync.ts";

const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");

const externalId = process.argv[2] || "0362400002226000157";
const t = db.prepare("SELECT * FROM Tender WHERE externalId = ?").get(externalId);
if (!t) {
  console.log("not found");
  process.exit(1);
}

const co = db.prepare("SELECT * FROM Company LIMIT 1").get();
const docs = db.prepare("SELECT * FROM Document WHERE companyId = ?").all(co.id);
const mapped = mapCompanyDocuments(docs);
const catalogRows = await loadCompanyCatalogProducts(co.id);
const catalogProducts = catalogRows.map((r) => r.displayText || r.name);
const catalogStructured = catalogRowsToStructured(catalogRows);

const focus = buildCompanyFocus({ description: co.description, catalogProducts });
const company = {
  okvedCodes: JSON.parse(co.okvedCodes || "[]"),
  revenue: co.revenue,
  region: co.region,
  description: co.description,
};

const reqs = normalizeStoredRequirements(JSON.parse(t.requirements));
const items = extractProcurementItems(reqs, t.title);
const rows = buildNomenclatureMatchTable(items, catalogProducts, catalogStructured);
const ruBlock = resolveRuMatchBlock({
  tenderTitle: t.title,
  tzProducts: reqs.tzProducts,
});
const blockedRows = ruBlock.blocked ? blockNomenclatureMatches(rows, ruBlock.reason) : rows;

const rank = rankTenderForFeed(t, focus, catalogProducts, mapped, company, {
  light: true,
  parsedReqs: JSON.parse(t.requirements),
});

const analysis = analyzeMatch(mapped, company, JSON.parse(t.requirements), t.okvedCode, t.region, {
  category: t.category,
  title: t.title,
});

const detailForecast = computeParticipationForecast(
  analysis.score,
  blockedRows,
  analysis.blockers.length > 0,
  catalogProducts.length > 0,
  { nomenclatureMismatch: analysis.nomenclatureMismatch || ruBlock.blocked }
);

const match = db
  .prepare("SELECT forecastChance, ruMatched, ruTotal, showInFeed, computedAt FROM TenderMatch WHERE tenderId = ?")
  .get(t.id);

console.log("===", externalId, "===");
console.log("title:", t.title);
console.log("tzProduct:", reqs.tzProducts?.[0]);
console.log("items:", items.map((i) => i.name));
console.log("nomRows:", blockedRows);
console.log("--- feed rank (light) ---");
console.log({
  forecastChance: rank.forecastChance,
  ruCoverage: rank.ruCoveragePercent,
  ruMatched: rank.ruMatched,
  ruTotal: rank.ruTotal,
  showInFeed: rank.showInFeed,
});
console.log("--- detail ---");
console.log({
  nomenclatureMismatch: analysis.nomenclatureMismatch,
  forecast: detailForecast.coveragePercent,
  matched: detailForecast.matchedItems,
  total: detailForecast.totalItems,
});
console.log("--- TenderMatch cache ---");
console.log(match || "нет в кэше");

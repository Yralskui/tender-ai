import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database("dev.db");

const ids = ["0744200000226005185", "0342300095826000193", "0351200000726000844"];
for (const id of ids) {
  const t = db.prepare("SELECT externalId, title, requirements FROM Tender WHERE externalId = ?").get(id);
  console.log("\n===", id, "===");
  if (!t) {
    console.log("NOT IN DB");
    continue;
  }
  console.log("title:", t.title);
  try {
    const r = JSON.parse(t.requirements);
    console.log("importMode:", r.importMode);
    console.log("tzEnrichmentPending:", r.tzEnrichmentPending);
    console.log("tzParsedFromFile:", r.tzParsedFromFile);
    console.log("tzProducts:", (r.tzProducts || []).slice(0, 5));
    console.log("productSpecs sample:", (r.productSpecs || []).slice(0, 15));
    console.log("technicalAssignment:", (r.technicalAssignment || "").slice(0, 500));
  } catch (e) {
    console.log("parse err", e.message);
  }
}

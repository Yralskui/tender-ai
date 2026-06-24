import { createRequire } from "module";
import { normalizeStoredRequirements } from "../src/lib/textNormalize.ts";
import { resolveTzVolumes, summarizeProcurementVolume } from "../src/lib/tzVolumes.ts";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles.ts";
import { buildTenderEconomics } from "../src/lib/tenderEconomics.ts";

const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");

const externalId = process.argv[2] || "0373200020226000117";
const t = db.prepare("SELECT title, price, requirements FROM Tender WHERE externalId = ?").get(externalId);
const r = normalizeStoredRequirements(JSON.parse(t.requirements));
const vols = resolveTzVolumes(r);
console.log("tzVolumes:", vols);
console.log("summary:", summarizeProcurementVolume(vols));
const bundles = buildProcurementBundles(r, t.title, ["Бахилы"], []);
console.log("bundle qty:", bundles[0]?.quantityText);
const econ = buildTenderEconomics(vols, t.title, t.price, [], []);
console.log("economics qty:", econ.lines[0]?.quantity, econ.lines[0]?.unit);

import { createRequire } from "module";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { createRequire as cr } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database("dev.db");

const total = db.prepare("SELECT COUNT(*) as c FROM Tender").get().c;
const rows = db.prepare("SELECT requirements FROM Tender").all();
let tzParsed = 0;
let tzPending = 0;
let hasSpecs = 0;
let hasProducts = 0;
let emptyTz = 0;
const procedures = new Map();

for (const { requirements } of rows) {
  let r = {};
  try {
    r = JSON.parse(requirements);
  } catch {
    continue;
  }
  if (r.tzParsedFromFile) tzParsed++;
  if (r.tzEnrichmentPending) tzPending++;
  const specs = (r.productSpecs || []).length;
  const prods = (r.tzProducts || []).length;
  if (specs > 0) hasSpecs++;
  if (prods > 0) hasProducts++;
  if (!r.tzParsedFromFile && !r.tzEnrichmentPending && specs < 3 && prods === 0) emptyTz++;
  const proc = (r.procedureType || "неизвестно").slice(0, 50);
  procedures.set(proc, (procedures.get(proc) || 0) + 1);
}

console.log("=== БАЗА ===");
console.log({ total, tzParsed, tzPending, hasSpecs, hasProducts, emptyTz });
console.log("\n=== ТИПЫ ПРОЦЕДУР (top) ===");
[...procedures.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([k, v]) => console.log(v, k));

const samples = db.prepare(`
  SELECT externalId, title, category, price, requirements
  FROM Tender
  WHERE requirements LIKE '%importedFromEis%'
  ORDER BY RANDOM()
  LIMIT 12
`).all();

console.log("\n=== СЛУЧАЙНАЯ ВЫБОРКА ===");
for (const t of samples) {
  let r = {};
  try {
    r = JSON.parse(t.requirements);
  } catch {}
  console.log("\n---", t.externalId, "---");
  console.log("proc:", r.procedureType);
  console.log("title:", (t.title || "").slice(0, 100));
  console.log("category:", t.category, "| price:", t.price);
  console.log("tzParsed:", r.tzParsedFromFile, "| pending:", r.tzEnrichmentPending);
  console.log("tzProducts:", (r.tzProducts || []).length, "| specs:", (r.productSpecs || []).length, "| volumes:", (r.tzVolumes || []).length);
  if (r.tzProducts?.[0]) console.log("  p0:", r.tzProducts[0].slice(0, 100));
  if (r.productSpecs?.[0]) console.log("  s0:", r.productSpecs[0].slice(0, 100));
}

db.close();

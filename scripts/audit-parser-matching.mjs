/**
 * Аудит: парсер ТЗ + сверка по реальным аукционам из базы.
 * node scripts/audit-parser-matching.mjs [limit]
 */
import { createRequire } from "module";
import { matchProductToCatalog } from "../src/lib/matching.ts";
import { buildNomenclatureMatchTable, extractProcurementItems } from "../src/lib/tenderPresentation.ts";
import { familiesForMatchLine, classifyProductFamily } from "../src/lib/productFamilies.ts";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport.ts";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database("dev.db");

const limit = Math.min(20, parseInt(process.argv[2] || "8", 10) || 8);

// Каталог первой компании с РУ
const company = db
  .prepare(
    `SELECT c.id, c.name FROM Company c
     JOIN Document d ON d.companyId = c.id
     WHERE d.type = 'medical_ru' OR d.extractedData LIKE '%catalogItems%'
     LIMIT 1`
  )
  .get();

let catalogProducts = [];
let catalogStructured = [];
if (company) {
  const docs = db
    .prepare("SELECT extractedData FROM Document WHERE companyId = ? AND status != 'error'")
    .all(company.id);
  for (const d of docs) {
    try {
      const ex = JSON.parse(d.extractedData || "{}");
      if (Array.isArray(ex.products)) catalogProducts.push(...ex.products.map(String));
      if (Array.isArray(ex.catalogItems)) catalogStructured.push(...ex.catalogItems);
    } catch {
      /* ignore */
    }
  }
  catalogProducts = [...new Set(catalogProducts)];
}
console.log("Компания для сверки:", company?.name || "нет", "| позиций РУ:", catalogProducts.length);

const tenders = db
  .prepare(
    `SELECT id, externalId, title, category, price, requirements
     FROM Tender
     WHERE requirements LIKE '%importedFromEis%'
     ORDER BY RANDOM()
     LIMIT ?`
  )
  .all(limit);

const issues = {
  noTz: [],
  pendingTz: [],
  garbageSpecs: [],
  singleWordProducts: [],
  familyMismatchMatch: [],
  parseRegress: [],
};

for (const t of tenders) {
  let r = {};
  try {
    r = JSON.parse(t.requirements);
  } catch {
    continue;
  }

  console.log("\n" + "=".repeat(72));
  console.log(t.externalId, "|", (r.procedureType || "?").slice(0, 45));
  console.log((t.title || "").slice(0, 95));

  const specs = r.productSpecs || [];
  const prods = r.tzProducts || [];
  const vols = r.tzVolumes || [];

  console.log(
    "В БД: tzParsed=",
    !!r.tzParsedFromFile,
    "| pending=",
    !!r.tzEnrichmentPending,
    "| products=",
    prods.length,
    "| specs=",
    specs.length,
    "| volumes=",
    vols.length
  );

  if (r.tzEnrichmentPending) issues.pendingTz.push(t.externalId);
  if (!r.tzParsedFromFile && specs.length < 2 && prods.length === 0) issues.noTz.push(t.externalId);

  // мусор в specs
  const garbage = specs.filter(
    (s) =>
      /участник\s+закупки|значение характеристики|^\d+\s*$/i.test(s) ||
      (s.length < 8 && !/^КТРУ:/i.test(s))
  );
  if (garbage.length > specs.length * 0.3 && specs.length > 5) {
    issues.garbageSpecs.push({ id: t.externalId, garbage: garbage.length, total: specs.length });
  }

  if (prods.length > 0) {
    const shortNames = prods.filter((p) => p.length < 12 || /^[\d.]+$/.test(p));
    if (shortNames.length) issues.singleWordProducts.push({ id: t.externalId, samples: shortNames.slice(0, 3) });
    console.log("  Позиции:", prods.slice(0, 3).map((p) => p.slice(0, 70)).join(" | "));
  } else if (specs.length > 0) {
    const names = specs.filter((s) => s.length > 20 && !s.includes(" — ")).slice(0, 2);
    console.log("  Specs как названия:", names.map((s) => s.slice(0, 70)).join(" | "));
  }

  // Семейства тендера
  const blob = [t.title, t.category, ...prods, ...specs.slice(0, 10)].join(" ");
  const tenderFamily = classifyProductFamily(blob) !== "unknown"
    ? classifyProductFamily(blob)
    : [...familiesForMatchLine(blob)][0];
  console.log("  Семейство тендера (оценка):", tenderFamily);

  // Сверка с РУ
  if (catalogProducts.length > 0) {
    const items = extractProcurementItems(
      {
        tzProducts: prods,
        productSpecs: specs,
        technicalAssignment: r.technicalAssignment,
        tzVolumes: vols,
      },
      t.title
    );
    const rows = buildNomenclatureMatchTable(items, catalogProducts, catalogStructured);
    const matched = rows.filter((x) => x.status === "match").length;
    const missing = rows.filter((x) => x.status === "missing").length;
    console.log("  Сверка РУ:", matched, "match /", rows.length, "поз., missing:", missing);
    for (const row of rows.filter((x) => x.status === "match").slice(0, 3)) {
      const reqF = classifyProductFamily(row.requested);
      const catF = row.matchedProduct ? classifyProductFamily(row.matchedProduct) : "unknown";
      if (reqF !== "unknown" && catF !== "unknown" && reqF !== catF) {
        issues.familyMismatchMatch.push({
          id: t.externalId,
          requested: row.requested.slice(0, 60),
          matched: row.matchedProduct?.slice(0, 60),
          reqF,
          catF,
        });
        console.log("  ⚠ ЛОЖНЫЙ MATCH:", row.requested.slice(0, 50), "→", row.matchedProduct?.slice(0, 50));
      }
    }
  }

  // Живой перепарс (1 тендер за раз, лимит 3 чтобы не долбить ЕИС)
}

// Перепарс 3 тендеров с pending или без ТЗ
const reparseCandidates = [
  ...issues.pendingTz.slice(0, 2),
  ...issues.noTz.slice(0, 2),
].slice(0, 3);

if (reparseCandidates.length > 0) {
  console.log("\n" + "=".repeat(72));
  console.log("ЖИВОЙ ПЕРЕПАРС ЕИС (", reparseCandidates.length, "шт.)");
  for (const externalId of reparseCandidates) {
    const row = db.prepare("SELECT requirements FROM Tender WHERE externalId = ?").get(externalId);
    let noticeType = "ea20";
    try {
      noticeType = JSON.parse(row.requirements).noticeType || "ea20";
    } catch {}
    console.log("\n--- live", externalId, noticeType, "---");
    try {
      const details = await fetchNoticeDetails(externalId, noticeType, { fetchTz: true });
      console.log(
        "live: products=",
        details.productSpecs?.length,
        "tzProducts=",
        details.tzProducts?.length,
        "volumes=",
        details.tzVolumes?.length,
        "tzParsed=",
        details.tzParsedFromFile
      );
      if (details.tzProducts?.length) {
        console.log("  live p0:", details.tzProducts[0]?.slice(0, 90));
      }
      const dbReq = JSON.parse(row.requirements);
      const dbProd = (dbReq.tzProducts || []).length;
      const liveProd = (details.tzProducts || []).length;
      if (liveProd > dbProd + 2) {
        issues.parseRegress.push({
          id: externalId,
          msg: `в БД ${dbProd} поз., live ${liveProd} — база устарела/не дообогащена`,
        });
      }
      if (liveProd === 0 && (details.productSpecs || []).length < 3) {
        issues.parseRegress.push({ id: externalId, msg: "live тоже пустой — парсер не смог вытащить ТЗ" });
      }
    } catch (e) {
      console.log("live error:", e.message?.slice(0, 120));
      issues.parseRegress.push({ id: externalId, msg: e.message?.slice(0, 80) });
    }
  }
}

console.log("\n" + "=".repeat(72));
console.log("ИТОГ АУДИТА");
console.log("Без ТЗ / мало данных:", issues.noTz.length, issues.noTz.slice(0, 5));
console.log("Ожидают обогащения:", issues.pendingTz.length);
console.log("Мусор в specs (>30%):", issues.garbageSpecs.length);
issues.garbageSpecs.slice(0, 3).forEach((x) => console.log(" ", x));
console.log("Короткие/битые названия позиций:", issues.singleWordProducts.length);
issues.singleWordProducts.slice(0, 3).forEach((x) => console.log(" ", x));
console.log("Ложные match (разные семейства):", issues.familyMismatchMatch.length);
issues.familyMismatchMatch.slice(0, 5).forEach((x) => console.log(" ", x));
console.log("Проблемы live-парса:", issues.parseRegress.length);
issues.parseRegress.forEach((x) => console.log(" ", x.id, x.msg));

db.close();

/**
 * Перенормализация tzProducts/productSpecs в БД (разорванные слова из DOCX).
 * node scripts/renormalize-tz-requirements.mjs
 */
import { createRequire } from "module";
import { normalizeStoredRequirements } from "../src/lib/textNormalize.ts";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database("dev.db");

const rows = db.prepare("SELECT id, externalId, requirements FROM Tender").all();
let updated = 0;

const update = db.prepare("UPDATE Tender SET requirements = ? WHERE id = ?");

for (const row of rows) {
  let reqs;
  try {
    reqs = JSON.parse(row.requirements);
  } catch {
    continue;
  }
  const normalized = normalizeStoredRequirements(reqs);
  const before = JSON.stringify(reqs);
  const after = JSON.stringify(normalized);
  if (before !== after) {
    update.run(after, row.id);
    updated++;
  }
}

console.log(`Обновлено ${updated} из ${rows.length} закупок`);
db.close();

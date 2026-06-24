import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(root, "..", "dev.db");
const db = new Database(dbPath);

const cols = db.prepare(`PRAGMA table_info(TenderMatch)`).all();
const names = new Set(cols.map((c) => c.name));

const alters = [
  ['feedScore', 'REAL NOT NULL DEFAULT 0'],
  ['showInFeed', 'BOOLEAN NOT NULL DEFAULT 0'],
  ['showInProfile', 'BOOLEAN NOT NULL DEFAULT 0'],
  ['ruMatched', 'INTEGER NOT NULL DEFAULT 0'],
  ['ruPartial', 'INTEGER NOT NULL DEFAULT 0'],
  ['ruTotal', 'INTEGER NOT NULL DEFAULT 0'],
  ['forecastChance', 'REAL NOT NULL DEFAULT 0'],
  ['relevanceScore', 'REAL NOT NULL DEFAULT 0'],
  ['hideReason', 'TEXT'],
  ['catalogHash', 'TEXT'],
  ['computedAt', 'DATETIME'],
  ['updatedAt', 'DATETIME'],
];

for (const [name, ddl] of alters) {
  if (!names.has(name)) {
    db.exec(`ALTER TABLE "TenderMatch" ADD COLUMN "${name}" ${ddl}`);
    console.log(`+ column ${name}`);
  }
}

const indexes = db.prepare(`PRAGMA index_list(TenderMatch)`).all();
const indexNames = new Set(indexes.map((i) => i.name));

if (!indexNames.has("TenderMatch_companyId_showInFeed_feedScore_idx")) {
  db.exec(
    `CREATE INDEX "TenderMatch_companyId_showInFeed_feedScore_idx" ON "TenderMatch"("companyId", "showInFeed", "feedScore")`
  );
  console.log("+ index showInFeed");
}

if (!indexNames.has("TenderMatch_companyId_showInProfile_relevanceScore_idx")) {
  db.exec(
    `CREATE INDEX "TenderMatch_companyId_showInProfile_relevanceScore_idx" ON "TenderMatch"("companyId", "showInProfile", "relevanceScore")`
  );
  console.log("+ index showInProfile");
}

if (names.has("updatedAt")) {
  db.exec(`UPDATE "TenderMatch" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL`);
}

db.close();
console.log("Feed cache migration OK");

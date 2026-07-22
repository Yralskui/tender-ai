import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");
const AdmZip = require("adm-zip");

const rows = db.prepare(`
  SELECT externalId, requirements
  FROM Tender
  WHERE json_extract(requirements, '$.importMode') = 'tz_enriched'
    AND (json_extract(requirements, '$.tzVolumes') IS NULL OR json_array_length(json_extract(requirements, '$.tzVolumes')) = 0)
    AND json_array_length(json_extract(requirements, '$.productSpecs')) > 2
`).all();

console.log("candidates:", rows.length);

let hasKolvoHeaderInSomeDoc = 0;
let hasLegacyDocOnly = 0;
let noCachedDocxAtAll = 0;
let checkedDocx = 0;
let errored = 0;

for (const r of rows) {
  const req = JSON.parse(r.requirements || "{}");
  const docs = req.tzDocuments || [];
  const docxCached = docs.filter(d => d.format === "docx" && d.cachedPath && fs.existsSync(d.cachedPath));
  const legacyDoc = docs.filter(d => d.format === "doc");

  if (docxCached.length === 0) {
    if (legacyDoc.length > 0) hasLegacyDocOnly++;
    else noCachedDocxAtAll++;
    continue;
  }

  let foundKolvo = false;
  for (const d of docxCached) {
    try {
      checkedDocx++;
      const zip = new AdmZip(d.cachedPath);
      const entry = zip.getEntry("word/document.xml");
      if (!entry) continue;
      const xml = entry.getData().toString("utf8");
      if (/Кол-во|Кол\.-во|Количество\s*,?\s*шт/i.test(xml)) {
        foundKolvo = true;
        break;
      }
    } catch {
      errored++;
    }
  }
  if (foundKolvo) hasKolvoHeaderInSomeDoc++;
}

console.log({ hasKolvoHeaderInSomeDoc, hasLegacyDocOnly, noCachedDocxAtAll, checkedDocx, errored });

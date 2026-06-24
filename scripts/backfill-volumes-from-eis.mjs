/**
 * Массовое заполнение tzVolumes из карточки ЕИС для закупок без объёма в БД.
 * Использование: npx tsx scripts/backfill-volumes-from-eis.mjs [--limit N] [--externalId ID]
 */

import { createRequire } from "module";
import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser.ts";
import { mergeEisVolumesIntoRequirements } from "../src/lib/fetchTzVolumesFromEis.ts";

const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 50 : 50;
const extIdx = args.indexOf("--externalId");
const onlyExternalId = extIdx >= 0 ? args[extIdx + 1] : null;

async function fetchVolumes(externalId, noticeType) {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${externalId}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TenderAI/1.0)" } });
  if (!res.ok) return null;
  const html = await res.text();
  const parsed = parseEisKtruCatalogHtml(html);
  const volumes = (parsed?.tzVolumes || []).filter((v) => v.quantity > 0);
  return volumes.length > 0 ? volumes : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const query = onlyExternalId
  ? `SELECT id, externalId, requirements FROM Tender WHERE externalId = ?`
  : `SELECT id, externalId, requirements FROM Tender
     WHERE requirements IS NOT NULL
       AND (json_extract(requirements, '$.tzVolumes') IS NULL
            OR json_array_length(json_extract(requirements, '$.tzVolumes')) = 0)
     LIMIT ?`;

const rows = onlyExternalId
  ? db.prepare(query).all(onlyExternalId)
  : db.prepare(query).all(limit);

console.log(`Backfill volumes: ${rows.length} tenders`);

let updated = 0;
let failed = 0;

for (const row of rows) {
  const reqs = JSON.parse(row.requirements);
  const noticeType = reqs.noticeType || "ea20";
  try {
    const volumes = await fetchVolumes(row.externalId, noticeType);
    if (!volumes) {
      failed++;
      console.log("  skip", row.externalId, "- no volumes in EIS");
      await sleep(400);
      continue;
    }
    const merged = mergeEisVolumesIntoRequirements(reqs, volumes);
    db.prepare("UPDATE Tender SET requirements = ? WHERE id = ?").run(
      JSON.stringify(merged),
      row.id
    );
    updated++;
    console.log(
      "  ok",
      row.externalId,
      volumes.map((v) => `${v.quantity} ${v.unit}`).join(", ")
    );
  } catch (e) {
    failed++;
    console.log("  err", row.externalId, e.message);
  }
  await sleep(350);
}

console.log(`Done: updated=${updated}, failed/skipped=${failed}`);

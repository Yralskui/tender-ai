import { readFile } from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import { parseDocxKtruTables } from "../src/lib/docxTableParser.ts";

const externalId = "0373100059326000406";
const cacheDir = path.join(process.cwd(), "data", "tz-cache", externalId);

const docx = await readFile(path.join(cacheDir, `${externalId}_Описание_объекта_закупки.docx`));
const parsed = parseDocxKtruTables(docx);
console.log("=== DOCX blocks ===");
console.log("products:", parsed?.products);
for (const b of parsed?.productBlocks || []) {
  console.log(`\n--- Block #${b.position}: ${b.name} (${b.code}) ---`);
  console.log("chars:", b.characteristics.length);
  for (const ch of b.characteristics) {
    console.log(`  [${ch.name}] => [${ch.value}]`);
  }
}

const xlsx = await readFile(path.join(cacheDir, `${externalId}_НМЦК_.xlsx`));
const wb = XLSX.read(xlsx, { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
console.log("\n=== NMCK rows (first 30) ===");
let n = 0;
for (const row of rows) {
  const cells = row.map((c) => String(c ?? "").trim());
  if (!/^\d+$/.test(cells[0] || "")) continue;
  n++;
  if (n > 30) break;
  console.log(cells.slice(0, 12).join(" | "));
}

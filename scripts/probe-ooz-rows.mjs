import { readFile, readdir } from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { extractTextFromDocxBuffer } from "../src/lib/officeText.ts";
import { parseWideOozTable, parseSimpleOozTable, parseDocxKtruTables } from "../src/lib/docxTableParser.ts";

const id = process.argv[2] || "0124200000626004062";
const dir = path.join(process.cwd(), "data", "tz-cache", id);
const f = (await readdir(dir)).find((x) => /описание/i.test(x));
if (!f) throw new Error("no ooz file");
const buf = await readFile(path.join(dir, f));

for (const [name, fn] of [
  ["wide", parseWideOozTable],
  ["simple", parseSimpleOozTable],
  ["ktru", parseDocxKtruTables],
]) {
  const r = fn(buf);
  console.log(name, r ? `blocks=${r.productBlocks?.length} products=${r.products.length}` : "null");
}

const zip = new AdmZip(buf);
const entry = zip.getEntry("word/document.xml");
if (!entry) throw new Error("no document.xml");
const xml = entry.getData().toString("utf8");
const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) =>
  [...r[1].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) =>
    [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .trim()
  )
);

console.log("\n=== TABLE ROWS (non-empty cells) ===");
let n = 0;
for (const cells of rows) {
  const filled = cells.filter((c) => c && c.length > 0);
  if (filled.length === 0) continue;
  n++;
  if (n > 200) break;
  console.log(`${n}:`, filled.join(" | "));
}

const text = extractTextFromDocxBuffer(buf);
const ktruMatches = [...text.matchAll(/КТРУ:\s*[\d.]+-\d+/g)];
console.log("\nKTRU count:", ktruMatches.length);
for (const m of ktruMatches) console.log(m[0]);

console.log("\n=== PRODUCT ROW CELLS ===");
const productRow = rows.find((cells) => cells.some((c) => /Простыня|Чехол|халат/i.test(c)));
if (productRow) {
  productRow.forEach((c, i) => console.log(`col${i}:`, JSON.stringify(c)));
}
console.log("total rows", rows.length);

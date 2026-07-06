import { readFileSync } from "fs";
import AdmZip from "adm-zip";
import { parseArticle33OozTable, parseWideOozTable, parseNoKtruWideOozTable, parseSimpleOozTable, parseDocxKtruTables, parseStackedArticle33OozTable } from "../src/lib/docxTableParser";
import { extractTextFromDocxBuffer } from "../src/lib/officeText";

const path =
  process.argv[2] ||
  "data/tz-cache/0124200000626004474/0124200000626004474_Описание_объекта_закупки.docx";

const buffer = readFileSync(path);

function extractRowCells(trXml: string): string[] {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
    const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return texts.join("").replace(/\s+/g, " ").trim();
  });
}

const zip = new AdmZip(buffer);
const xml = zip.getEntry("word/document.xml")!.getData().toString("utf8");
const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => extractRowCells(r[1]));

console.log("rows:", rows.length);
console.log("\n--- first 30 non-empty rows ---");
let shown = 0;
for (const [i, cells] of rows.entries()) {
  if (cells.every((c) => !c)) continue;
  console.log(`\n[${i}] (${cells.length} cells)`);
  cells.forEach((c, j) => {
    if (c) console.log(`  ${j}: ${c.slice(0, 140)}${c.length > 140 ? "…" : ""}`);
  });
  if (++shown >= 35) break;
}

console.log("\n--- filtered rows (бахилы, флакон, qty) ---");
for (const [i, cells] of rows.entries()) {
  if (cells.every((c) => !c)) continue;
  const j = cells.join("|");
  if (/бахил|00003066|00001440|флакон|вязкост|≥|штук|компл/i.test(j)) {
    console.log(`\n[${i}] (${cells.length} cells)`);
    cells.forEach((c, k) => {
      if (c) console.log(`  ${k}: ${c.slice(0, 120)}`);
    });
  }
}

console.log("\n--- rows 80-96 full ---");
for (let i = 80; i < rows.length; i++) {
  const cells = rows[i];
  if (cells.every((c) => !c)) continue;
  console.log(`\n[${i}] (${cells.length} cells)`);
  cells.forEach((c, k) => {
    if (c) console.log(`  ${k}: ${c}`);
  });
}

console.log("\n--- parsers ---");
for (const [name, fn] of [
  ["stackedArticle33", parseStackedArticle33OozTable],
  ["article33", parseArticle33OozTable],
  ["wide", parseWideOozTable],
  ["noKtruWide", parseNoKtruWideOozTable],
  ["simple", parseSimpleOozTable],
  ["ktru", parseDocxKtruTables],
] as const) {
  const r = fn(buffer);
  if (r) {
    console.log(`\n${name}: ${r.products.length} products, ${r.productSpecs.length} specs`);
    for (const b of r.productBlocks || []) {
      console.log(`  #${b.position} ${b.name} [${b.code}] qty=${b.quantity} chars=${b.characteristics.length}`);
      for (const ch of b.characteristics.slice(0, 4)) {
        console.log(`    - ${ch.name}: ${ch.value.slice(0, 80)}`);
      }
    }
  } else {
    console.log(`\n${name}: null`);
  }
}

const text = extractTextFromDocxBuffer(buffer);
console.log("\n--- text sample ---");
console.log(text?.slice(0, 2000));

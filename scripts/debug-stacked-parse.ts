import { readFileSync } from "fs";
import AdmZip from "adm-zip";
import { normalizeTzSpecText } from "../src/lib/textNormalize";
import { parseStackedArticle33OozTable } from "../src/lib/docxTableParser";

const KTRU_CODE_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}(?:-\d{8,})?)\b/;

function joinDocxCellTexts(texts: string[]): string {
  return texts
    .reduce((acc, part) => {
      if (!part) return acc;
      if (!acc) return part;
      const prev = acc.slice(-1);
      const next = part[0];
      const needSpace =
        /[а-яёa-z0-9]$/i.test(prev) &&
        /^[а-яёa-z]/i.test(next) &&
        !/[\s\-—–/(]$/.test(acc);
      return acc + (needSpace ? " " : "") + part;
    }, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRowCells(trXml: string): string[] {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
    const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return normalizeTzSpecText(joinDocxCellTexts(texts));
  });
}

const path =
  process.argv[2] ||
  "data/tz-cache/0124200000626004474/0124200000626004474_Описание_объекта_закупки.docx";
const buffer = readFileSync(path);
const zip = new AdmZip(buffer);
const xml = zip.getEntry("word/document.xml")!.getData().toString("utf8");
const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => extractRowCells(r[1]));

console.log("row0", JSON.stringify(rows[0]?.[0]));
const hasWideHeader = rows.some((cells) =>
  cells.some((c) =>
    /наименование\s+товара.*дополнительная\s+информация/i.test(c.replace(/\s+/g, " "))
  )
);
console.log("hasWideHeader", hasWideHeader);

let productCount = 0;
for (const [i, cells] of rows.entries()) {
  const code = (cells[1] || "").match(KTRU_CODE_RE)?.[1];
  if (code && (cells[0] || "").length >= 6) {
    productCount++;
    console.log("product row", i, cells[0].slice(0, 60), code);
  }
}
console.log("product rows", productCount);

let valueCount = 0;
for (const [i, cells] of rows.entries()) {
  const name = (cells[0] || "").trim();
  const value = (cells[1] || "").trim();
  if (!name && value && /^(соответствие|наличие|>=|≥)/i.test(value)) {
    valueCount++;
    if (valueCount <= 5) console.log("value row", i, JSON.stringify(cells));
  }
}
console.log("value rows", valueCount);

const result = parseStackedArticle33OozTable(buffer);
console.log("parse result", result ? result.products.length : "NULL");
if (result?.productBlocks) {
  for (const b of result.productBlocks) {
    console.log(`#${b.position} ${b.name} (${b.characteristics.length})`);
    for (const ch of b.characteristics) console.log(`  ${ch.name}: ${ch.value}`);
  }
}

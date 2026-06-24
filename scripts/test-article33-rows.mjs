import { readFileSync } from "fs";
import AdmZip from "adm-zip";
import { normalizeTzSpecText } from "../src/lib/textNormalize.ts";

function extractRowCells(trXml) {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
    .map((tc) => {
      const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      return texts.join("").replace(/\s+/g, " ").trim();
    })
    .map((cell) => normalizeTzSpecText(cell));
}

const buf = readFileSync(
  "data/tz-cache/0124200000626004062/0124200000626004062_Описание_объекта_закупки.docx"
);
const xml = new AdmZip(buf).getEntry("word/document.xml").getData().toString("utf8");
const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)];

for (let i = 3; i <= 16; i++) {
  const cells = extractRowCells(rows[i][1]);
  const filled = cells.filter((c) => c && c.length > 0);
  console.log(`row ${i}: total=${cells.length} filled=${filled.length}`, JSON.stringify(filled));
}

import { readFile } from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { normalizeTzSpecText } from "../src/lib/textNormalize.ts";

const id = "0342300126626000060";
const buf = await readFile(path.join("data", "tz-cache", id, `${id}_Описание_объекта_закупки.docx`));
const zip = new AdmZip(buf);
const xml = zip.getEntry("word/document.xml").getData().toString("utf8");

function extractRowCells(trXml) {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
    const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return normalizeTzSpecText(texts.join("").replace(/\s+/g, " ").trim());
  });
}

let n = 0;
for (const row of xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
  const cells = extractRowCells(row[1]);
  n++;
  if (n <= 35 || /КОМП|30\.|кол-во/i.test(cells.join(" "))) {
    console.log(`--- row ${n} (${cells.filter(Boolean).length} cells) ---`);
    cells.forEach((c, i) => c && console.log(` [${i}] ${c.slice(0, 90)}`));
  }
}

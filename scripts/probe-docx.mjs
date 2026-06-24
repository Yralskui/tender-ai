import { createRequire } from "module";
import AdmZip from "adm-zip";

const require = createRequire(import.meta.url);
const fs = require("fs");
const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/probe-docx.mjs <path>");
  process.exit(1);
}

const buf = fs.readFileSync(path);
const zip = new AdmZip(buf);
const xml = zip.getEntry("word/document.xml").getData().toString("utf8");
console.log("rows", (xml.match(/<w:tr/g) || []).length, "tbl", (xml.match(/<w:tbl/g) || []).length);

for (const row of [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].slice(0, 15)) {
  const cells = [...row[1].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
    const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return texts.join("").replace(/\s+/g, " ").trim();
  });
  if (cells.some((c) => c)) console.log("ROW:", cells);
}

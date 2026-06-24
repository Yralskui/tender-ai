import { readFile, readdir } from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { parseArticle33OozTable } from "../src/lib/docxTableParser.ts";
import { parseNmckDocxProducts } from "../src/lib/nmckExcelParser.ts";
import { parseOozDocxBuffer } from "../src/lib/tzDocumentParse.ts";

const externalId = process.argv[2] || "0124200000626004062";
const dir = path.join(process.cwd(), "data", "tz-cache", externalId);
const files = await readdir(dir);

for (const f of files) {
  const buf = await readFile(path.join(dir, f));
  if (/описание|объект/i.test(f)) {
    const zip = new AdmZip(buf);
    const xml = zip.getEntry("word/document.xml").getData().toString("utf8");
    const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)];
    console.log("\n=== OOZ rows:", rows.length);
    for (const [i, r] of rows.entries()) {
      const cells = [...r[1].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
        const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
        return texts.join("").replace(/\s+/g, " ").trim();
      });
      const filled = cells.filter(Boolean);
      if (filled.length === 0) continue;
      if (i >= 3 && i <= 22) {
        console.log(`row ${i} (${cells.length} cells):`, filled.join(" | ").slice(0, 150));
      }
    }
    const a33 = parseArticle33OozTable(buf);
    const ooz = parseOozDocxBuffer(buf);
    console.log("article33:", a33?.products, "chars:", a33?.productSpecs?.length);
    for (const s of a33?.productSpecs || []) console.log("  spec:", s);
    console.log("block name:", a33?.productBlocks?.[0]?.name);
    for (const ch of a33?.productBlocks?.[0]?.characteristics || []) {
      console.log("  ch:", JSON.stringify(ch));
    }
    console.log("parseOoz:", ooz?.source, ooz?.quality, ooz?.products);
  }
  if (/обоснован/i.test(f)) {
    const nmck = parseNmckDocxProducts(buf);
    console.log("\n=== NMCK DOCX ===", nmck);
  }
}

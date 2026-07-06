import { readFileSync } from "fs";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";

// inline extract - same as docxTableParser
import AdmZip from "adm-zip";

const id = "0372200115726000039";

async function main() {
  const enriched = await enrichNoticeFromTzCache(id);
  const doc = enriched?.documents?.find((d) => /описание объекта/i.test(d.name));
  if (!doc?.cachedPath) return;
  const zip = new AdmZip(readFileSync(doc.cachedPath));
  const xml = zip.getEntry("word/document.xml")!.getData().toString("utf8");
  const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => {
    return [...r[1].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
      const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      return texts.join("").replace(/\s+/g, " ").trim();
    });
  });

  let inRange = false;
  for (const cells of rows) {
    const pos = (cells[0] || "").trim();
    if (/^(1[0-4])$/.test(pos)) inRange = true;
    if (inRange && /^(15|16)$/.test(pos)) break;
    if (!inRange) continue;
    if (cells.some((c) => c)) {
      console.log("ROW:", JSON.stringify(cells.slice(0, 8)));
    }
  }
}

main();

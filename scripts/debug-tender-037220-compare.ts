import { readFileSync } from "fs";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";
import AdmZip from "adm-zip";

// Copy minimal test - import internal via re-parse
import { parseArticle33OozTable, parseDocxKtruTables } from "../src/lib/docxTableParser";

async function main() {
  const enriched = await enrichNoticeFromTzCache("0372200115726000039");
  const doc = enriched!.documents!.find((d) => /описание/i.test(d.name))!;
  const buf = readFileSync(doc.cachedPath!);

  const a33 = parseArticle33OozTable(buf)!;
  const b11 = a33.productBlocks!.find((b) => b.position === "11")!;
  console.log("article33 #11 chars:", b11.characteristics.length);
  console.log("last 5 char names:");
  for (const c of b11.characteristics.slice(-8)) console.log(" ", c.name.slice(0, 80));

  const ktru = parseDocxKtruTables(buf)!;
  console.log("\nktru blocks:", ktru.productBlocks!.map((b) => `#${b.position} ${b.name.slice(0, 40)}`));

  // Score comparison
  const { scoreTzParseQuality } = await import("../src/lib/tzSanitizer");
  console.log("\nscores: article33=", scoreTzParseQuality(a33), "ktru=", scoreTzParseQuality(ktru));
}

main();

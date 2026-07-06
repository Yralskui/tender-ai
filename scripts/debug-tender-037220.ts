import { readFileSync } from "fs";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";
import {
  parseArticle33OozTable,
  parseWideOozTable,
  parseStackedArticle33OozTable,
  parseDocxKtruTables,
  parseSimpleOozTable,
} from "../src/lib/docxTableParser";
import { parseOozDocxBuffer } from "../src/lib/tzDocumentParse";

const id = "0372200115726000039";

async function main() {
  const enriched = await enrichNoticeFromTzCache(id);
  if (!enriched) {
    console.log("no cache");
    return;
  }

  const doc = enriched.documents?.find((d) => /описание объекта/i.test(d.name));
  console.log("doc:", doc?.name, doc?.cachedPath);

  const specs = enriched.productSpecs || [];
  console.log("\n--- specs with 12: or гипс ---");
  for (const s of specs) {
    if (/^1[0-4]:|гипс|21\.20\.24\.132/i.test(s)) console.log(s);
  }

  if (!doc?.cachedPath) return;
  const buf = readFileSync(doc.cachedPath);

  const parsers = [
    ["stacked", parseStackedArticle33OozTable],
    ["article33", parseArticle33OozTable],
    ["wide", parseWideOozTable],
    ["simple", parseSimpleOozTable],
    ["ktru", parseDocxKtruTables],
    ["ooz", () => parseOozDocxBuffer(buf)],
  ] as const;

  for (const [name, fn] of parsers) {
    const r = fn(buf);
    if (!r) {
      console.log(`\n${name}: null`);
      continue;
    }
    console.log(`\n${name}: products=${r.products.length} blocks=${r.productBlocks?.length ?? 0} specs=${r.productSpecs.length}`);
    for (const b of r.productBlocks || []) {
      if (!b.position || parseInt(b.position, 10) >= 10) {
        console.log(`  #${b.position} ${b.name} [${b.code}] chars=${b.characteristics.length}`);
        for (const c of b.characteristics.slice(0, 4)) console.log(`    ${c.name}: ${c.value}`);
      }
    }
  }
}

main().catch(console.error);

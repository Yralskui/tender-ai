import { readFile, readdir } from "fs/promises";
import path from "path";
import { parseDocumentAttachment } from "../src/lib/tzDocumentParse.ts";
import { extractTextFromDocxBuffer } from "../src/lib/officeText.ts";

const externalId = process.argv[2];
if (!externalId) {
  console.error("Usage: npx tsx scripts/probe-one-tender.mjs <externalId>");
  process.exit(1);
}

const dir = path.join(process.cwd(), "data", "tz-cache", externalId);
const files = await readdir(dir);
console.log("cache:", files.length, "files");

for (const f of files) {
  const buf = await readFile(path.join(dir, f));
  if (/описание|объект/i.test(f)) {
    const text = extractTextFromDocxBuffer(buf);
    console.log("\n=== RAW OOZ TEXT ===");
    console.log(text);
  }
  const parsed = await parseDocumentAttachment(buf, f);
  console.log("\n===", f, "===");
  console.log("parsed:", parsed ? `${parsed.source} q=${parsed.quality}` : "null");
  if (!parsed) {
    if (/описание|объект/i.test(f)) {
      const text = extractTextFromDocxBuffer(buf);
      console.log("raw text sample:", text?.slice(0, 1500));
    }
    continue;
  }
  console.log("products:", parsed.products);
  console.log("specs:", parsed.productSpecs?.length);
  for (const s of parsed.productSpecs?.slice(0, 12) || []) console.log(" -", s);
  console.log("blocks:", parsed.productBlocks?.length);
  for (const b of parsed.productBlocks?.slice(0, 4) || []) {
    console.log(`block ${b.position}: ${b.name} (${b.code}) chars=${b.characteristics.length}`);
    for (const ch of b.characteristics.slice(0, 8)) {
      console.log(`  [${ch.name}] => [${ch.value}]`);
    }
  }
  console.log("tzVolumes:", parsed.tzVolumes);
}

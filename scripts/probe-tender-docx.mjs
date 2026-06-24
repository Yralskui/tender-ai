import { readFile } from "fs/promises";
import path from "path";
import { parseWideOozTable, parseSimpleOozTable, parseDocxKtruTables } from "../src/lib/docxTableParser.ts";
import { parseNmckExcelProducts } from "../src/lib/nmckExcelParser.ts";

const externalId = "0373100059326000406";
const cacheDir = path.join(process.cwd(), "data", "tz-cache", externalId);
const { readdir } = await import("fs/promises");
const files = await readdir(cacheDir);
console.log("cache files:", files);

for (const f of files) {
  if (!f.endsWith(".docx") && !f.endsWith(".xlsx")) continue;
  const buf = await readFile(path.join(cacheDir, f));
  console.log("\n===", f, "===");
  if (f.endsWith(".docx")) {
    for (const [name, fn] of [
      ["wide", parseWideOozTable],
      ["simple", parseSimpleOozTable],
      ["ktru", parseDocxKtruTables],
    ]) {
      const r = fn(buf);
      if (!r) {
        console.log(name, ": null");
        continue;
      }
      console.log(name, "products:", r.products);
      console.log(name, "specs:", r.productSpecs.length);
      if (r.productBlocks?.[0]) {
        const b = r.productBlocks[0];
        console.log("block0:", b.name, "chars:", b.characteristics.length);
        console.log("sample chars:", b.characteristics.slice(0, 5));
        console.log("qty chars:", b.characteristics.filter((c) => /шт|колич|объем/i.test(c.name + c.value)));
      }
    }
  } else {
    const items = parseNmckExcelProducts(buf);
    console.log("nmck items:", items);
  }
}

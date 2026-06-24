import fs from "fs";
import path from "path";
import { parseArticle33OozTable, parseNoKtruWideOozTable, parseWideOozTable, parseSimpleOozTable, parseDocxKtruTables } from "../src/lib/docxTableParser.ts";
import { parseOozDocxBuffer, parseDocumentAttachment } from "../src/lib/tzDocumentParse.ts";
import { parseNmckExcelProducts } from "../src/lib/nmckExcelParser.ts";
import { extractTextFromDocxBuffer } from "../src/lib/officeText.ts";

const reg = "0372100049626001334";
const dir = path.join("data", "tz-cache", reg);
const files = fs.readdirSync(dir);

for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  console.log("\n===", f, buf.length, "bytes ===");

  if (f.endsWith(".xlsx")) {
    const items = parseNmckExcelProducts(buf);
    console.log("nmck items:", items.length, items.slice(0, 3));
    continue;
  }

  if (f.endsWith(".docx")) {
    for (const [name, fn] of [
      ["article33", parseArticle33OozTable],
      ["noKtruWide", parseNoKtruWideOozTable],
      ["wide", parseWideOozTable],
      ["simple", parseSimpleOozTable],
      ["ktruTables", parseDocxKtruTables],
      ["oozDocx", parseOozDocxBuffer],
      ["attachment", () => parseDocumentAttachment(buf, f)],
    ]) {
      try {
        const r = fn(buf);
        const n = r?.products?.length ?? 0;
        const s = r?.productSpecs?.length ?? r?.quality ?? 0;
        console.log(name, "->", n, "products", typeof s === "number" ? `q/specs=${s}` : `specs=${r?.productSpecs?.length}`);
        if (n > 0) {
          console.log("  products:", r.products);
          console.log("  specs sample:", r.productSpecs?.slice(0, 5));
        }
      } catch (e) {
        console.log(name, "ERR", e.message);
      }
    }

    const text = await extractTextFromDocxBuffer(buf);
    console.log("plain text lines:", text.text.split("\n").filter(Boolean).slice(0, 20));
  }
}

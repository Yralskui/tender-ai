import { readFile } from "fs/promises";
import { readdir } from "fs/promises";
import path from "path";
import { parseDocumentAttachment } from "../src/lib/tzDocumentParse";
import { extractTextFromXlsxBuffer } from "../src/lib/excelText";

async function main() {
  const dir = path.join(process.cwd(), "data", "tz-cache", "0372200041826000050");
  const files = await readdir(dir);
  const xlsx = files.find((f) => /\.xlsx$/i.test(f));
  if (!xlsx) {
    console.log("no xlsx", files);
    return;
  }
  const buffer = await readFile(path.join(dir, xlsx));
  console.log("file:", xlsx, buffer.length);
  const text = extractTextFromXlsxBuffer(buffer);
  console.log("text length:", text?.length);
  console.log("text sample:\n", text?.slice(0, 2500));
  const parsed = parseDocumentAttachment(buffer, "Описание объекта закупки.xlsx");
  console.log("\nparsed quality:", parsed?.quality, "specs:", parsed?.productSpecs.length);
  console.log("products:", parsed?.products);
  for (const s of parsed?.productSpecs || []) console.log(" ", s);
}

main().catch(console.error);

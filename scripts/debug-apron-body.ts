import { readFile } from "fs/promises";
import path from "path";
import { readdir } from "fs/promises";
import { extractTextFromXlsxBuffer } from "../src/lib/excelText";

async function main() {
  const dir = path.join(process.cwd(), "data", "tz-cache", "0372200041826000050");
  const xlsx = (await readdir(dir)).find((f) => /\.xlsx$/i.test(f))!;
  const text = extractTextFromXlsxBuffer(await readFile(path.join(dir, xlsx)))!;
  const idx = text.indexOf("14.12.30.190-00000009");
  const chunk = text.slice(idx, idx + 900);
  console.log(chunk);
  const segments = chunk.split(/\n|(?=\s*(?:кач|кол)\s+)/i).map((s) => s.trim()).filter(Boolean);
  console.log("\nsegments:", segments.length);
  segments.forEach((s, i) => console.log(i, JSON.stringify(s.slice(0, 100))));
}

main().catch(console.error);

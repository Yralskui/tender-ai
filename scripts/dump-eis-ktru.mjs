import { writeFile } from "fs/promises";
import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser.ts";

const reg = process.argv[2];
const noticeType = process.argv[3] || "ea20";
const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${reg}`;
const html = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0" },
  signal: AbortSignal.timeout(30000),
}).then((r) => r.text());

await writeFile(`data/eis-${reg}.html`, html);
const parsed = parseEisKtruCatalogHtml(html);
console.log("truInfo ids:", [...html.matchAll(/showInfo\('truInfo_(\d+)'/g)].map((m) => m[1]));
console.log("parsed blocks:", parsed?.productBlocks?.length);
for (const b of parsed?.productBlocks || []) {
  console.log("\n--- block", b.position, "---");
  console.log("code:", b.code);
  console.log("name:", b.name);
  console.log("chars:", b.characteristics.slice(0, 8).map((c) => `${c.name}: ${c.value}`));
}

// dump first truInfo row raw
const m = html.match(/<tr class="tableBlock__row">[\s\S]*?showInfo\('truInfo_0'[\s\S]*?<\/tr>/i);
if (m) {
  const snippet = m[0].replace(/></g, ">\n<").slice(0, 4000);
  console.log("\n=== RAW truInfo_0 row (first 4000) ===\n", snippet);
}

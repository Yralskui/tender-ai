import { writeFileSync } from "fs";
import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser.ts";

const regNumber = process.argv[2] || "0373200020226000117";
const url = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${regNumber}`;

const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
writeFileSync("tmp-eis.html", html);

const patterns = ["штук", "Количество", "кол-во", "Кол-во", "quantity", "6400", "246 000"];
for (const p of patterns) {
  const i = html.toLowerCase().indexOf(p.toLowerCase());
  console.log(p, i >= 0 ? `found@${i}: ${html.slice(i, i + 80).replace(/\s+/g, " ")}` : "not found");
}

const row = html.match(/showInfo\('truInfo_1'[\s\S]{0,4000}/)?.[0];
if (row) {
  writeFileSync("tmp-eis-row.html", row);
  console.log("row saved, len", row.length);
  const cols = [...row.matchAll(/tableBlock__col[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  console.log("cols in row:", cols);
}

const parsed = parseEisKtruCatalogHtml(html);
console.log("parsed blocks", parsed?.productBlocks?.map((b) => ({ pos: b.position, qty: b.quantity, name: b.name?.slice(0, 30) })));

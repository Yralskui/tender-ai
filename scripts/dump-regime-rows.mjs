import fs from "fs";

const reg = process.argv[2] || "0342300126626000060";
const noticeType = process.argv[3] || "zk20";
const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${reg}`;
const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
});
const html = await res.text();
fs.writeFileSync("scripts/sample-regime.html", html);

const start = html.search(/Применение национального режима/i);
console.log("start", start);
const chunk = html.slice(start, start + 15000);
const rows = [...chunk.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi)];
for (const row of rows) {
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  if (cells.some((c) => /запрет|огранич|преимущ|13\.|14\./i.test(c))) {
    console.log("CELLS:", cells.length, cells.map((c) => c.slice(0, 120)).join(" || "));
  }
}

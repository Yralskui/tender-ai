import fs from "fs";

const reg = "0347200005726000009";
const url = `https://zakupki.gov.ru/epz/order/notice/zk20/view/common-info.html?regNumber=${reg}`;
const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
});
const html = await res.text();
fs.writeFileSync("scripts/sample-common-info.html", html.slice(0, 80000));

const sectionTitles = [...html.matchAll(/class="section__title"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
console.log("sections", sectionTitles.slice(0, 20));

const tableRows = [...html.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/g)].slice(0, 15);
for (const row of tableRows) {
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
    c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  if (cells.length) console.log("ROW:", cells.join(" | "));
}

const infoValues = [...html.matchAll(/class="section__info"[^>]*>([\s\S]*?)<\/section>/g)].slice(0, 10);
for (const v of infoValues) {
  console.log("INFO:", v[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200));
}

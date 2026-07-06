import { writeFile } from "fs/promises";

async function main() {
  const externalId = "0372200041826000050";
  const url = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${externalId}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const m = html.match(/<tr class="truInfo_2"[\s\S]*?<\/tr>/i);
  console.log("truInfo_2 length:", m?.[0]?.length);
  if (m) console.log(m[0].slice(0, 3000));
  const row = html.match(/showInfo\('truInfo_2'[\s\S]*?<\/tr>/i);
  console.log("\nmain row snippet:");
  console.log(row?.[0]?.slice(0, 2000));
  await writeFile("scripts/eis-snippet.html", row?.[0] || "none");
}

main().catch(console.error);

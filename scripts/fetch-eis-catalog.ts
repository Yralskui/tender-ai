import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser";

async function main() {
  const externalId = process.argv[2] || "0372200041826000050";
  const url = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${externalId}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const parsed = parseEisKtruCatalogHtml(html);
  console.log("blocks:", parsed?.productBlocks?.length);
  for (const b of parsed?.productBlocks || []) {
    console.log(`pos ${b.position} ktru ${b.code} name: ${b.name} qty ${b.quantity} chars ${b.characteristics.length}`);
    for (const ch of b.characteristics.slice(0, 8)) console.log("  ", ch.name, "=", ch.value?.slice(0, 60));
  }
}

main().catch(console.error);

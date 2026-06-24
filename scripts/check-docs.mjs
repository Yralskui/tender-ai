import { parseDocumentsPageHtml, enrichNoticeFromTzDocuments } from "../src/lib/zakupkiDocuments";

const reg = process.argv[2] || "0847100000826000006";
const type = process.argv[3] || "ea20";
const url = `https://zakupki.gov.ru/epz/order/notice/${type}/view/documents.html?regNumber=${reg}`;
const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
const docs = parseDocumentsPageHtml(html);
console.log(reg, "→", docs.length, "docs");
docs.forEach((d) => console.log(`  ${d.score} ${d.name}`));

if (docs.length > 0) {
  const enriched = await enrichNoticeFromTzDocuments(reg, type);
  console.log("enriched:", enriched?.tzParsedFromFile, enriched?.productSpecs.length);
}

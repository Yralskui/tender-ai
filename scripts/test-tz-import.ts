/**
 * Тест парсера ТЗ и импорта с файлами.
 * npx tsx scripts/test-tz-import.ts [regNumber] [noticeType]
 */
import { readFile } from "fs/promises";
import path from "path";
import { parseTzText } from "../src/lib/tzParser";
import { extractTextFromDocxBuffer } from "../src/lib/officeText";
import { parseDocumentsPageHtml, enrichNoticeFromTzDocuments } from "../src/lib/zakupkiDocuments";
import { fetchNoticeDetails } from "../src/lib/zakupkiImport";

const reg = process.argv[2] || "0347200005726000009";
const noticeType = process.argv[3] || "zk20";

async function testLocalDocx() {
  const docPath = path.join(process.cwd(), "scripts", "tmp-docs", "tz.doc");
  try {
    const buf = await readFile(docPath);
    const text = extractTextFromDocxBuffer(buf);
    if (!text) {
      console.log("Local DOCX: no text");
      return;
    }
    const parsed = parseTzText(text);
    console.log("\n=== LOCAL DOCX PARSE ===");
    console.log("products:", parsed.products.length);
    console.log("specs:", parsed.productSpecs.length);
    console.log("sample products:", parsed.products.slice(0, 3));
    console.log("sample specs:", parsed.productSpecs.slice(0, 8));
  } catch {
    console.log("Local DOCX not found — skip");
  }
}

async function testLive() {
  console.log("\n=== LIVE documents.html ===", reg);
  const html = await (await fetch(
    `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/documents.html?regNumber=${reg}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  )).text();
  const attachments = parseDocumentsPageHtml(html);
  console.log("attachments:", attachments.map((a) => `${a.score} ${a.name}`));

  console.log("\n=== LIVE TZ enrichment ===");
  const enriched = await enrichNoticeFromTzDocuments(reg, noticeType);
  if (!enriched) {
    console.log("No enrichment");
    return;
  }
  console.log("tzParsedFromFile:", enriched.tzParsedFromFile);
  console.log("products:", enriched.products.slice(0, 4));
  console.log("specs:", enriched.productSpecs.length);
  console.log("documents:", enriched.documents);
  console.log("sample specs:", enriched.productSpecs.slice(0, 10));

  console.log("\n=== FULL fetchNoticeDetails ===");
  const details = await fetchNoticeDetails(reg, noticeType);
  console.log("title:", details.title.slice(0, 80));
  console.log("tzParsedFromFile:", details.tzParsedFromFile);
  console.log("total specs:", details.productSpecs.length);
}

async function main() {
  await testLocalDocx();
  await testLive();
}

main().catch(console.error);

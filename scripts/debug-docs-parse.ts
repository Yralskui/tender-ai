import { writeFile } from "fs/promises";
import { fetchDocumentsPageHtml, parseDocumentsPageHtml } from "../src/lib/zakupkiDocuments";

const externalId = "0373200045226001053";
const noticeType = "ea20";

async function main() {
  const html = await fetchDocumentsPageHtml(externalId, noticeType);
  await writeFile("scripts/debug-docs-page.html", html, "utf8");
  const parsed = parseDocumentsPageHtml(html);
  console.log("parsed count:", parsed.length);
  for (const p of parsed) {
    console.log("-", p.name, "| score:", p.score);
  }
  console.log("\nHTML length:", html.length);

  // Count pdf mentions
  const pdfLinks = [...html.matchAll(/href="([^"]+)"/gi)].filter((m) =>
    /filestore|download|downloadFile/i.test(m[1])
  );
  console.log("\nAll download hrefs:", pdfLinks.length);
  for (const m of pdfLinks.slice(0, 20)) {
    console.log(m[1].slice(0, 100));
  }
}

main().catch(console.error);

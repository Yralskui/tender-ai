import { fetchDocumentsPageHtml, parseDocumentsPageHtml } from "../src/lib/zakupkiDocuments";
import { zakupkiFetch } from "../src/lib/zakupkiQueue";

const externalId = "0373200045226001053";
const noticeType = "ea20";

async function main() {
  const html = await fetchDocumentsPageHtml(externalId, noticeType);
  const attachments = parseDocumentsPageHtml(html);
  const pdf = attachments.find((a) => a.name.endsWith(".pdf"));
  if (!pdf) {
    console.log("no pdf", attachments);
    return;
  }
  console.log("downloading", pdf.name, pdf.url);
  const res = await zakupkiFetch(pdf.url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  console.log("status", res.status, "type", res.headers.get("content-type"));
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("size", buf.length, "magic", buf.slice(0, 5).toString("hex"));
}

main().catch(console.error);

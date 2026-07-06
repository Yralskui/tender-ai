import { prisma } from "../src/lib/prisma";
import {
  findProcurementDocument,
  listProcurementDocumentsResolved,
  noticeTypeFromRequirements,
  resolveProcurementDocumentBuffer,
} from "../src/lib/procurementDocuments";
import { fetchTenderAttachment, parseDocumentsPageHtml, fetchDocumentsPageHtml } from "../src/lib/zakupkiDocuments";

const tenderId = process.argv[2] || "cmr145yhv00247ssy1rvmbst6";
const docName = process.argv[3] || "Описание объекта закупки";

async function main() {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) {
    console.error("tender not found", tenderId);
    return;
  }
  const requirements = JSON.parse(tender.requirements as string);
  const docs = await listProcurementDocumentsResolved(requirements, tender.externalId);
  const doc = findProcurementDocument(docs, docName);
  const noticeType = noticeTypeFromRequirements(requirements);
  console.log({ externalId: tender.externalId, noticeType, docsCount: docs.length, doc, docNames: docs.map((d) => d.name) });

  if (!doc) {
    console.error("doc not found in list");
    return;
  }

  try {
    const html = await fetchDocumentsPageHtml(tender.externalId, noticeType);
    const attachments = parseDocumentsPageHtml(html);
    console.log("attachments on EIS:", attachments.map((a) => ({ name: a.name, score: a.score, url: a.url.slice(0, 80) })));
  } catch (e) {
    console.error("fetch documents page failed:", e);
  }

  try {
    const fetched = await fetchTenderAttachment(tender.externalId, noticeType, doc.name);
    console.log("fetchTenderAttachment:", fetched ? { fileName: fetched.fileName, size: fetched.buffer.length } : null);
  } catch (e) {
    console.error("fetchTenderAttachment error:", e);
  }

  const resolved = await resolveProcurementDocumentBuffer(tender.externalId, doc, { noticeType });
  console.log("resolve:", resolved ? { fileName: resolved.fileName, size: resolved.buf.length } : null);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

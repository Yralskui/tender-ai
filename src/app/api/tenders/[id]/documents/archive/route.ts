import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import {
  contentTypeByExt,
  isArchiveFileName,
  listProcurementDocumentsResolved,
  noticeTypeFromRequirements,
  resolveProcurementDocumentBuffer,
  safeFileName,
  tryReadSingleArchiveFromCache,
} from "@/lib/procurementDocuments";

export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requirements = normalizeStoredRequirements(JSON.parse(tender.requirements as string));
  const docs = await listProcurementDocumentsResolved(requirements, tender.externalId);
  const noticeType = noticeTypeFromRequirements(requirements);

  if (docs.length === 0) {
    const singleArchive = await tryReadSingleArchiveFromCache(tender.externalId);
    if (singleArchive) {
      return serveBuffer(singleArchive.buf, singleArchive.fileName);
    }
    return NextResponse.json({ error: "no_documents" }, { status: 404 });
  }

  const resolvedList: Array<{ buf: Buffer; fileName: string }> = [];
  for (const doc of docs) {
    const resolved = await resolveProcurementDocumentBuffer(tender.externalId, doc, { noticeType });
    if (resolved) resolvedList.push(resolved);
  }

  if (resolvedList.length === 0) {
    const singleArchive = await tryReadSingleArchiveFromCache(tender.externalId);
    if (singleArchive) {
      return serveBuffer(singleArchive.buf, singleArchive.fileName);
    }
    return NextResponse.json({ error: "archive_empty" }, { status: 404 });
  }

  // Один архив с ЕИС — отдаём как есть, без перепаковки
  if (resolvedList.length === 1 && isArchiveFileName(resolvedList[0].fileName)) {
    return serveBuffer(resolvedList[0].buf, resolvedList[0].fileName);
  }

  const zip = new AdmZip();
  const usedNames = new Set<string>();

  for (const { buf, fileName } of resolvedList) {
    let entryName = safeFileName(fileName);
    if (usedNames.has(entryName)) {
      const ext = entryName.match(/(\.[^.]+)$/)?.[1] || "";
      const base = entryName.replace(/\.[^.]+$/, "");
      let n = 2;
      while (usedNames.has(`${base}_${n}${ext}`)) n++;
      entryName = `${base}_${n}${ext}`;
    }
    usedNames.add(entryName);
    zip.addFile(entryName, buf);
  }

  const archiveName = safeFileName(`zakupka_${tender.externalId}_documents.zip`);
  return serveBuffer(zip.toBuffer(), archiveName, "application/zip");
}

function serveBuffer(buf: Buffer, fileName: string, contentType?: string) {
  const ext = (fileName.match(/\.(\w+)$/i)?.[1] || "").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType || contentTypeByExt(ext),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

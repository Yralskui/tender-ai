import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import {
  resolveProcurementDocumentBuffer,
  safeFileName,
  type StoredProcurementDocument,
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
  const docs = (requirements.tzDocuments || requirements.tenderDocuments || []) as StoredProcurementDocument[];

  if (docs.length === 0) {
    return NextResponse.json({ error: "no_documents" }, { status: 404 });
  }

  const zip = new AdmZip();
  const usedNames = new Set<string>();
  let added = 0;

  for (const doc of docs) {
    const resolved = await resolveProcurementDocumentBuffer(tender.externalId, doc);
    if (!resolved) continue;

    let entryName = safeFileName(resolved.fileName);
    if (usedNames.has(entryName)) {
      const ext = entryName.match(/(\.[^.]+)$/)?.[1] || "";
      const base = entryName.replace(/\.[^.]+$/, "");
      let n = 2;
      while (usedNames.has(`${base}_${n}${ext}`)) n++;
      entryName = `${base}_${n}${ext}`;
    }
    usedNames.add(entryName);
    zip.addFile(entryName, resolved.buf);
    added++;
  }

  if (added === 0) {
    return NextResponse.json({ error: "archive_empty" }, { status: 404 });
  }

  const archiveName = safeFileName(`zakupka_${tender.externalId}_documents.zip`);
  const buf = zip.toBuffer();

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`,
    },
  });
}

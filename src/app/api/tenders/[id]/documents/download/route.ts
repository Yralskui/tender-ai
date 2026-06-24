import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import {
  contentTypeByExt,
  resolveProcurementDocumentBuffer,
  safeFileName,
  type StoredProcurementDocument,
} from "@/lib/procurementDocuments";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requirements = normalizeStoredRequirements(JSON.parse(tender.requirements as string));
  const urlObj = new URL(_req.url);
  const name = urlObj.searchParams.get("name") || "";

  const docs = (requirements.tzDocuments || requirements.tenderDocuments || []) as StoredProcurementDocument[];
  const doc = docs.find((d) => d.name === name) || (name ? null : docs[0]);
  if (!doc) return NextResponse.json({ error: "doc_not_found" }, { status: 404 });

  const resolved = await resolveProcurementDocumentBuffer(tender.externalId, doc);
  if (!resolved) return NextResponse.json({ error: "download_failed" }, { status: 404 });

  const ext = (resolved.fileName.match(/\.(\w+)$/i)?.[1] || "").toLowerCase();
  return new NextResponse(new Uint8Array(resolved.buf), {
    headers: {
      "Content-Type": contentTypeByExt(ext),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resolved.fileName)}`,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import { listProcurementDocumentsResolved } from "@/lib/procurementDocuments";

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requirements = normalizeStoredRequirements(JSON.parse(tender.requirements as string));
  const documents = await listProcurementDocumentsResolved(requirements, tender.externalId);

  return NextResponse.json({ documents });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enrichTenderById } from "@/lib/tzEnrichmentJob";
import { prisma } from "@/lib/prisma";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import { summarizeTzDisplayCounts } from "@/lib/tenderPresentation";

export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await enrichTenderById(id);

  if (result.success) {
    const tender = await prisma.tender.findUnique({
      where: { id },
      select: { title: true, requirements: true },
    });
    if (tender?.requirements) {
      const requirements = normalizeStoredRequirements(
        JSON.parse(tender.requirements as string) as Record<string, unknown>
      );
      const counts = summarizeTzDisplayCounts(requirements, tender.title);
      result.specCount = counts.charCount;
      result.productCount = counts.productCount;
      if (result.tzParsedFromFile) {
        result.message = `ТЗ из файла: ${counts.charCount} характеристик, ${counts.productCount} позиций`;
      } else if (counts.charCount > 0) {
        result.message = `Карточка ЕИС: ${counts.charCount} характеристик${counts.productCount > 0 ? `, ${counts.productCount} позиций` : ""}`;
      }
    }
  }

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

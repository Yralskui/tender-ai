import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeDocument, aiProvider } from "@/lib/aiAnalysis";
import { saveDocumentAnalysis } from "@/lib/documentAnalysisJob";

export const maxDuration = 300;

/** Полная перепроверка одного документа (без ожидания всей папки) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: true },
  });
  if (!user?.company) return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.companyId !== user.company.id) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  try {
    await prisma.document.update({ where: { id }, data: { status: "pending" } });

    const analysis = await analyzeDocument(
      doc.fileUrl,
      doc.name,
      doc.type === "irrelevant" ? "other" : doc.type,
      { mode: "full" }
    );

    const { isRelevant, warning } = await saveDocumentAnalysis(id, user.company.id, analysis, {
      existingExpiresAt: doc.expiresAt,
    });

    const updated = await prisma.document.findUnique({ where: { id } });

    return NextResponse.json({
      success: true,
      isRelevant,
      warning,
      aiProvider,
      document: {
        ...updated,
        expiresAt: updated?.expiresAt?.toISOString() ?? null,
        createdAt: updated?.createdAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error(`Reanalyze one failed for ${id}:`, e);
    await prisma.document.update({ where: { id }, data: { status: "error" } });
    return NextResponse.json({ error: "Не удалось перепроверить документ" }, { status: 500 });
  }
}

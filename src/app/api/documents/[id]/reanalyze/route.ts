import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeDocument, aiProvider, isPricelistFileName } from "@/lib/aiAnalysis";
import { saveDocumentAnalysis } from "@/lib/documentAnalysisJob";
import { backgroundJobsInNext } from "@/lib/runtimeConfig";
import { enqueueDocumentAnalysisJob } from "@/lib/documentJobQueue";
import { ingestPricelistDocument } from "@/lib/supplierPriceSync";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";
import { getAccessStatus } from "@/lib/subscription";

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
  if (!getAccessStatus(user).hasAccess) {
    return NextResponse.json({ error: "Требуется подписка" }, { status: 403 });
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.companyId !== user.company.id) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  if (!backgroundJobsInNext()) {
    await prisma.document.update({ where: { id }, data: { status: "pending" } });
    await enqueueDocumentAnalysisJob({
      documentId: id,
      companyId: user.company.id,
      enqueuedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      queued: true,
      message: "Разбор поставлен в очередь worker",
    });
  }

  try {
    await prisma.document.update({ where: { id }, data: { status: "pending" } });

    const treatAsPricelist =
      doc.type === "supplier_price" ||
      (doc.type === "irrelevant" && isPricelistFileName(doc.name)) ||
      (doc.type === "medical_ru" && isPricelistFileName(doc.name));

    if (treatAsPricelist) {
      const filePath = path.join(process.cwd(), "public", doc.fileUrl.replace(/^\//, ""));
      const buffer = await readFile(filePath);
      const { count, summary, warning } = await ingestPricelistDocument(
        id,
        user.company.id,
        buffer,
        doc.name
      );
      scheduleCompanyFeedCacheRebuild(user.company.id);
      const updated = await prisma.document.findUnique({ where: { id } });
      return NextResponse.json({
        success: true,
        isRelevant: count > 0,
        warning,
        aiProvider,
        aiSummary: summary,
        document: {
          ...updated,
          expiresAt: updated?.expiresAt?.toISOString() ?? null,
          createdAt: updated?.createdAt?.toISOString() ?? null,
        },
      });
    }

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

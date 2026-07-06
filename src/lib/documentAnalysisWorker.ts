/**
 * Обработка одного документа (AI) — вызывается из worker.
 */

import { prisma } from "@/lib/prisma";
import { analyzeDocument } from "@/lib/aiAnalysis";
import { saveDocumentAnalysis } from "@/lib/documentAnalysisJob";
import type { DocumentAnalysisJob } from "@/lib/documentJobQueue";
import { invalidateUserSessionCache } from "@/lib/auth";

export async function processDocumentAnalysisJob(
  job: DocumentAnalysisJob
): Promise<{ ok: boolean; message: string }> {
  const doc = await prisma.document.findUnique({ where: { id: job.documentId } });
  if (!doc || doc.companyId !== job.companyId) {
    return { ok: false, message: "документ не найден" };
  }

  try {
    await prisma.document.update({ where: { id: job.documentId }, data: { status: "pending" } });

    const analysis = await analyzeDocument(
      doc.fileUrl,
      doc.name,
      doc.type === "irrelevant" ? "other" : doc.type,
      { mode: "full" }
    );

    const { isRelevant } = await saveDocumentAnalysis(job.documentId, job.companyId, analysis, {
      existingExpiresAt: doc.expiresAt,
    });

    const company = await prisma.company.findUnique({
      where: { id: job.companyId },
      select: { userId: true },
    });
    if (company?.userId) await invalidateUserSessionCache(company.userId);

    return {
      ok: true,
      message: isRelevant ? "документ разобран, релевантен" : "документ разобран",
    };
  } catch (e) {
    console.error(`[worker] document job ${job.documentId}:`, e);
    await prisma.document.update({ where: { id: job.documentId }, data: { status: "error" } });
    return { ok: false, message: String(e) };
  }
}

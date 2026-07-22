import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeDocument, aiProvider } from "@/lib/aiAnalysis";
import { saveDocumentAnalysis } from "@/lib/documentAnalysisJob";
import { getAccessStatus } from "@/lib/subscription";

export const maxDuration = 300;

/** Перепроверить все документы компании через AI */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: { include: { documents: true } } },
  });

  if (!user?.company) return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });
  if (!getAccessStatus(user).hasAccess) {
    return NextResponse.json({ error: "Требуется подписка" }, { status: 403 });
  }

  let updated = 0;
  const results: Array<{ id: string; name: string; isRelevant: boolean; warning: string | null }> = [];

  for (const doc of user.company.documents) {
    try {
      await prisma.document.update({ where: { id: doc.id }, data: { status: "pending" } });

      const analysis = await analyzeDocument(doc.fileUrl, doc.name, doc.type === "irrelevant" ? "other" : doc.type, {
        mode: "full",
      });
      const { isRelevant, warning } = await saveDocumentAnalysis(doc.id, user.company.id, analysis);

      updated++;
      results.push({ id: doc.id, name: doc.name, isRelevant, warning });
    } catch (e) {
      console.error(`Reanalyze failed for ${doc.id}:`, e);
      await prisma.document.update({ where: { id: doc.id }, data: { status: "error" } });
    }
  }

  return NextResponse.json({ success: true, updated, results });
}

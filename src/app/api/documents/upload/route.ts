import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateDocForProfile } from "@/lib/docRecommendations";
import {
  analyzeDocument,
  analyzeDocumentFallback,
  isAIEnabled,
  aiProvider,
  probePdfTextLength,
  shouldRunFullDocumentAnalysis,
  isPricelistFileName,
} from "@/lib/aiAnalysis";
import { saveDocumentAnalysis } from "@/lib/documentAnalysisJob";
import { ingestPricelistDocument } from "@/lib/supplierPriceSync";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const maxDuration = 300;

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/jpg", "application/octet-stream"];
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp"];

const FULL_ANALYSIS_BUDGET_MS = 240_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      console.error("FormData parse error:", e);
      return NextResponse.json(
        {
          error:
            "Не удалось принять файл. Переименуйте PDF (уберите скобки и спецсимволы) или уменьшите размер до 20 МБ, затем попробуйте снова.",
        },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File;
    const originalName = (formData.get("originalName") as string) || "";
    const docType = (formData.get("type") as string) || "other";
    const expiresAtStr = formData.get("expiresAt") as string;

    if (!file) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });

    const displayName = originalName.trim() || file.name;
    const effectiveDocType =
      docType !== "supplier_price" && isPricelistFileName(displayName) ? "supplier_price" : docType;

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "Файл слишком большой. Максимум 20 МБ" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "Формат не поддерживается. Используйте PDF, JPG или PNG" }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(file.type) && !ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "Формат не поддерживается. Используйте PDF, JPG или PNG" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const storageExt = ext;
    const fileName = `${user.company.id}_${Date.now()}.${storageExt}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads");

    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, fileName), buffer);

    const fileUrl = `/uploads/${fileName}`;
    const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null;

    let okvedCodes: string[] = [];
    try {
      okvedCodes = JSON.parse(user.company.okvedCodes || "[]");
    } catch {}
    const profileWarning = validateDocForProfile(docType, displayName, okvedCodes);

    const document = await prisma.document.create({
      data: {
        name: displayName,
        type: effectiveDocType,
        fileUrl,
        expiresAt,
        status: "pending",
        companyId: user.company.id,
      },
    });

    let aiWarning: string | null = null;
    let aiSummary: string | null = null;
    let isRelevant = false;
    let analysisPending = false;
    const typeAutoNote =
      effectiveDocType !== docType
        ? "Файл похож на прайс-лист — разобран как цены поставщика, не как РУ."
        : null;

    if (effectiveDocType === "supplier_price") {
      const { count, summary, warning } = await ingestPricelistDocument(
        document.id,
        user.company.id,
        buffer,
        displayName
      );
      isRelevant = count > 0;
      aiSummary = summary;
      aiWarning = warning;
      scheduleCompanyFeedCacheRebuild(user.company.id);
    } else try {
      // 1) Быстрый разбор (текст + имя файла) — обычно 5–30 сек
      let analysis = await analyzeDocument(fileUrl, displayName, effectiveDocType, { mode: "quick" });
      const pdfTextLength = ext === "pdf" ? await probePdfTextLength(fileUrl) : null;

      const needsFull = shouldRunFullDocumentAnalysis(analysis, {
        ext,
        userDocType: effectiveDocType,
        pdfTextLength,
      });

      // 2) Полный разбор со сканами — для РУ/сертификатов и «тонкого» каталога
      if (needsFull) {
        const full = await Promise.race([
          analyzeDocument(fileUrl, displayName, effectiveDocType, { mode: "full" }),
          sleep(FULL_ANALYSIS_BUDGET_MS).then(() => null),
        ]);
        if (full) {
          analysis = full;
        } else if (!analysis.isRelevantForTenders) {
          analysis = analyzeDocumentFallback(displayName, effectiveDocType);
        } else {
          const catalogCount = Math.max(
            analysis.catalogItems?.length ?? 0,
            analysis.products?.length ?? 0
          );
          analysis = {
            ...analysis,
            warning:
              analysis.warning ||
              (catalogCount <= 8
                ? "Каталог из приложения РУ ещё не разобран полностью — идёт фоновая проверка. Можно нажать «Перепроверить» на карточке документа."
                : "Полный разбор не уложился в лимит времени — нажмите «Перепроверить» для повторной проверки."),
          };
          analysisPending = true;
        }
      }

      isRelevant = analysis.isRelevantForTenders === true;
      aiSummary = analysis.summary || null;
      aiWarning = analysis.warning || (!isRelevant ? analysis.summary : null);

      const { warning } = await saveDocumentAnalysis(document.id, user.company.id, analysis, {
        expiresAt,
        existingExpiresAt: expiresAt,
      });
      if (warning) aiWarning = warning;

      if (analysisPending) {
        const docId = document.id;
        const companyId = user.company.id;
        after(async () => {
          try {
            await prisma.document.update({ where: { id: docId }, data: { status: "pending" } });
            const full = await analyzeDocument(fileUrl, displayName, effectiveDocType, { mode: "full" });
            await saveDocumentAnalysis(docId, companyId, full, { existingExpiresAt: expiresAt });
          } catch (e) {
            console.error(`Background analysis failed for ${docId}:`, e);
            await prisma.document.update({
              where: { id: docId },
              data: {
                status: "processed",
                extractedData: JSON.stringify({
                  isRelevant,
                  warning: "Фоновый разбор не завершился — нажмите «Перепроверить» на карточке документа.",
                }),
              },
            });
          }
        });
      }
    } catch (e) {
      console.error("Analysis failed:", e);
      const fallback = analyzeDocumentFallback(displayName, effectiveDocType);
      isRelevant = fallback.isRelevantForTenders === true;
      aiSummary = fallback.summary;
      aiWarning = fallback.warning;
      await saveDocumentAnalysis(document.id, user.company.id, fallback, { expiresAt });
    }

    const finalDoc = await prisma.document.findUnique({ where: { id: document.id } });

    return NextResponse.json({
      success: true,
      document: {
        ...finalDoc,
        expiresAt: finalDoc?.expiresAt?.toISOString() ?? null,
        createdAt: finalDoc?.createdAt?.toISOString() ?? new Date().toISOString(),
      },
      warning: aiWarning || typeAutoNote || profileWarning,
      profileWarning,
      aiWarning,
      aiSummary,
      isRelevant,
      analysisPending,
      aiEnabled: isAIEnabled,
      aiProvider,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: `Ошибка загрузки файла: ${message}` }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { normalizeStoredRequirements } from "@/lib/textNormalize";
import { classifyProcurementDocument } from "@/lib/procurementDocumentGroups";
import {
  contentTypeByExt,
  findProcurementDocument,
  listProcurementDocumentsResolved,
  noticeTypeFromRequirements,
  resolveProcurementDocumentBuffer,
} from "@/lib/procurementDocuments";

export const maxDuration = 120;

type DownloadErrorCode = "not_found" | "doc_not_found" | "download_failed";

function wantsHtmlPage(req: Request): boolean {
  const u = new URL(req.url);
  if (u.searchParams.get("ui") === "1") return true;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html") && !accept.includes("application/octet-stream");
}

function errorMessage(code: DownloadErrorCode, docName: string): string {
  const group = classifyProcurementDocument(docName);
  if (code === "doc_not_found") {
    if (group === "contract") {
      return "Проект контракта не сохранён в кэше. Откройте документ на zakupki.gov.ru или попробуйте позже.";
    }
    return "Документ не найден в кэше. Нажмите «Разобрать ТЗ» или откройте файл на ЕИС.";
  }
  if (code === "download_failed") {
    return "Не удалось скачать файл с zakupki.gov.ru — ссылка могла устареть.";
  }
  return "Тендер не найден.";
}

function downloadError(
  req: Request,
  tenderId: string,
  code: DownloadErrorCode,
  docName: string
): NextResponse {
  if (wantsHtmlPage(req)) {
    const url = new URL(`/tenders/${tenderId}/documents/unavailable`, req.url);
    url.searchParams.set("name", docName);
    url.searchParams.set("reason", code);
    return NextResponse.redirect(url);
  }
  return NextResponse.json(
    { error: code, message: errorMessage(code, docName) },
    { status: 404 }
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const urlObj = new URL(_req.url);
  const name = urlObj.searchParams.get("name") || "";

  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) return downloadError(_req, id, "not_found", name);

  const requirements = normalizeStoredRequirements(JSON.parse(tender.requirements as string));

  const docs = await listProcurementDocumentsResolved(requirements, tender.externalId);
  const doc = findProcurementDocument(docs, name);
  if (!doc) return downloadError(_req, id, "doc_not_found", name);

  const noticeType = noticeTypeFromRequirements(requirements);
  const resolved = await resolveProcurementDocumentBuffer(tender.externalId, doc, { noticeType });
  if (!resolved) {
    return downloadError(_req, id, "download_failed", name);
  }

  const ext = (resolved.fileName.match(/\.(\w+)$/i)?.[1] || doc.format || "").toLowerCase();
  return new NextResponse(new Uint8Array(resolved.buf), {
    headers: {
      "Content-Type": contentTypeByExt(ext),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resolved.fileName)}`,
    },
  });
}

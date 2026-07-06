import Link from "next/link";
import { ArrowLeft, ExternalLink, FileWarning } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { classifyProcurementDocument } from "@/lib/procurementDocumentGroups";
import { buildZakupkiUrl } from "@/lib/zakupki";
import { prisma } from "@/lib/prisma";

export default async function DocumentUnavailablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string; reason?: string }>;
}) {
  const { id } = await params;
  const { name = "Документ", reason = "doc_not_found" } = await searchParams;

  const tender = await prisma.tender.findUnique({
    where: { id },
    select: { externalId: true, title: true },
  });

  const group = classifyProcurementDocument(name);
  const eisUrl = tender ? buildZakupkiUrl(tender.externalId) : "https://zakupki.gov.ru";

  const title =
    reason === "download_failed"
      ? "Не удалось скачать файл"
      : group === "contract"
        ? "Проект контракта недоступен"
        : "Документ не найден";

  const detail =
    reason === "download_failed"
      ? "Сервер zakupki.gov.ru не отдал файл. Возможно, ссылка устарела или документ снят с публикации."
      : group === "contract"
        ? "Мы скачиваем в первую очередь ТЗ и описание объекта закупки. Проект контракта часто нужно открыть напрямую на ЕИС."
        : "Файл ещё не сохранён в кэше TenderAI. Попробуйте «Разобрать ТЗ сейчас» на карточке тендера.";

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="flex-1 p-8 max-w-lg mx-auto flex flex-col justify-center">
        <div
          className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 p-8 text-center shadow-lg shadow-amber-100/50"
          style={{ animation: "fadeIn 0.4s ease-out" }}
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-5 animate-pulse">
            <FileWarning size={32} className="text-amber-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">{title}</h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-1">{detail}</p>
          <p className="text-xs text-slate-500 mb-6 break-words">{name}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {tender && (
              <Link
                href={`/tenders/${id}`}
                className="inline-flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-colors"
              >
                <ArrowLeft size={16} />
                К карточке тендера
              </Link>
            )}
            <a
              href={eisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Открыть на zakupki.gov.ru
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

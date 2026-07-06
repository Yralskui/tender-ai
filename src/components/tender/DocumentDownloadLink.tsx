"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, FileWarning } from "lucide-react";
import { classifyProcurementDocument } from "@/lib/procurementDocumentGroups";

type DownloadErrorCode = "not_found" | "doc_not_found" | "download_failed" | "network";

function errorCopy(code: DownloadErrorCode, docName: string): { title: string; detail: string } {
  const group = classifyProcurementDocument(docName);
  if (code === "doc_not_found") {
    return {
      title: "Документ не найден",
      detail:
        group === "contract"
          ? "Проект контракта ещё не сохранён локально. Откройте карточку на zakupki.gov.ru — иногда файл доступен только там."
          : group === "notice"
            ? "Извещение не скачано в кэш. Попробуйте «Разобрать ТЗ» или откройте закупку на ЕИС."
            : "Файл отсутствует в кэше приложения. Нажмите «Разобрать ТЗ сейчас» или откройте документ на zakupki.gov.ru.",
    };
  }
  if (code === "download_failed") {
    return {
      title: "Не удалось скачать",
      detail:
        "Сервер zakupki.gov.ru не отдал файл (возможно, устаревшая ссылка или документ снят с публикации). Откройте закупку на ЕИС вручную.",
    };
  }
  if (code === "network") {
    return {
      title: "Нет связи с сервером",
      detail: "Проверьте интернет и повторите попытку через минуту.",
    };
  }
  return {
    title: "Тендер не найден",
    detail: "Обновите страницу или вернитесь к списку тендеров.",
  };
}

interface Props {
  tenderId: string;
  docName: string;
  eisUrl?: string | null;
  className?: string;
  children?: React.ReactNode;
}

export default function DocumentDownloadLink({
  tenderId,
  docName,
  eisUrl,
  className = "text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors",
  children,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const href = `/api/tenders/${tenderId}/documents/download?name=${encodeURIComponent(docName)}`;

    try {
      const res = await fetch(href);
      if (!res.ok) {
        let code: DownloadErrorCode = "download_failed";
        let detail: string | undefined;
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          if (data.error === "not_found") code = "not_found";
          else if (data.error === "doc_not_found") code = "doc_not_found";
          else if (data.error === "download_failed") code = "download_failed";
          detail = data.message;
        } catch {
          /* not json */
        }
        const copy = errorCopy(code, docName);
        setError({ title: copy.title, detail: detail || copy.detail });
        return;
      }

      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const utfMatch = disp.match(/filename\*=UTF-8''([^;]+)/i);
      const fileName = utfMatch
        ? decodeURIComponent(utfMatch[1])
        : docName.replace(/[\\/:*?"<>|]+/g, "_");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(errorCopy("network", docName));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Загрузка…
          </span>
        ) : (
          children ?? (
            <span className="inline-flex items-center gap-1">
              <Download size={12} />
              Скачать
            </span>
          )
        )}
      </button>

      {error && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3 shadow-lg shadow-amber-100/80"
          style={{ animation: "fadeIn 0.25s ease-out" }}
          role="alert"
        >
          <div className="flex gap-2">
            <div className="shrink-0 mt-0.5 text-amber-600 animate-pulse">
              <FileWarning size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-900">{error.title}</p>
              <p className="text-[11px] text-amber-800/90 mt-1 leading-relaxed">{error.detail}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-[10px] px-2 py-1 rounded-md bg-white border border-amber-200 text-amber-900 hover:bg-amber-50"
                >
                  Понятно
                </button>
                {eisUrl && (
                  <a
                    href={eisUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-0.5"
                  >
                    ЕИС <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

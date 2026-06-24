"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  tenderId: string;
  /** Показывать даже если есть черновые данные из извещения */
  showWhenPending?: boolean;
  compact?: boolean;
}

export default function AnalyzeTzButton({
  tenderId,
  showWhenPending = true,
  compact = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!showWhenPending) return null;

  async function runAnalyze() {
    setLoading(true);
    setStatus("Скачиваем документы с zakupki.gov.ru и разбираем ТЗ…");
    setError(false);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/analyze-tz`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(true);
        setStatus(data.message || "Не удалось разобрать ТЗ");
        return;
      }
      setStatus(data.message);
      router.refresh();
    } catch {
      setError(true);
      setStatus("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "mt-3"}>
      <button
        type="button"
        onClick={runAnalyze}
        disabled={loading}
        className={`inline-flex items-center gap-2 font-medium text-white transition-all hover:opacity-90 disabled:opacity-60 btn-primary ${
          compact ? "text-xs px-3 py-2 rounded-lg" : "text-sm px-4 py-2.5 rounded-xl w-full sm:w-auto justify-center"
        }`}
      >
        {loading ? <Loader2 size={compact ? 14 : 16} className="animate-spin" /> : <FileSearch size={compact ? 14 : 16} />}
        {loading ? "Разбор ТЗ…" : "Разобрать ТЗ сейчас"}
      </button>
      {status && (
        <p
          className={`text-xs mt-2 flex items-start gap-1.5 ${error ? "text-red-600" : "text-emerald-700"}`}
        >
          {error ? <AlertCircle size={12} className="shrink-0 mt-0.5" /> : <CheckCircle size={12} className="shrink-0 mt-0.5" />}
          {status}
        </p>
      )}
      {!compact && !status && (
        <p className="text-[11px] text-slate-500 mt-1.5">
          Приоритетная загрузка: описание объекта закупки и техническое задание с ЕИС
        </p>
      )}
    </div>
  );
}

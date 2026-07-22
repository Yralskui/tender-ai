"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle, AlertCircle, Database, Loader2 } from "lucide-react";
import {
  readSyncButtonVisible,
  SYNC_BUTTON_VISIBILITY_EVENT,
} from "@/lib/syncButtonVisibility";

interface Props {
  className?: string;
  compact?: boolean;
}

export default function TendersSyncButton({ className = "", compact = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"idle" | "smart" | "catalog">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bgProgress, setBgProgress] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readSyncButtonVisible());
    const onChange = () => setVisible(readSyncButtonVisible());
    window.addEventListener(SYNC_BUTTON_VISIBILITY_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(SYNC_BUTTON_VISIBILITY_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tenders/sync/status");
      const data = await res.json();
      if (data.sync?.progress) setBgProgress(data.sync.progress);
      if (data.tz?.lastMessage && data.tz.running) {
        setBgProgress(data.tz.lastMessage);
      }
      if (data.sync?.phase === "done") {
        setMessage(data.sync.message || "Синхронизация завершена");
        setLoading("idle");
        setBgProgress(null);
        router.refresh();
        return false;
      }
      if (data.sync?.phase === "error") {
        setError(data.sync.error || "Ошибка синхронизации");
        setLoading("idle");
        setBgProgress(null);
        return false;
      }
      return data.busy || data.tz?.running;
    } catch {
      return false;
    }
  }, [router]);

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    void pollStatus().then((busy) => {
      if (busy) setLoading("smart");
    });
    timer = setInterval(async () => {
      const busy = await pollStatus();
      if (!busy && timer) clearInterval(timer);
    }, 2500);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [pollStatus, visible]);

  if (!visible) return null;

  async function runSync(mode: "smart" | "catalog") {
    setLoading(mode);
    setMessage(null);
    setError(null);
    setBgProgress("Запуск…");
    try {
      const limit = mode === "catalog" ? 1200 : 220;
      const res = await fetch(`/api/tenders/sync?mode=${mode}&limit=${limit}&background=true`, {
        method: "GET",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Ошибка синхронизации");
        setLoading("idle");
        setBgProgress(null);
        return;
      }
      if (data.alreadyRunning) {
        setBgProgress(data.job?.progress || "Уже выполняется…");
        return;
      }
      setMessage(data.message || "Синхронизация в фоне — можно пользоваться сайтом");
      setBgProgress(data.job?.progress || "Идёт подбор…");
    } catch {
      setError("Ошибка соединения");
      setLoading("idle");
      setBgProgress(null);
    }
  }

  const busy = loading !== "idle";

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 justify-end">
        <button
          type="button"
          onClick={() => runSync("smart")}
          disabled={busy}
          title="Поиск → карточки ЕИС → ТЗ в фоне"
          className="flex items-center gap-1.5 px-3 py-2 sm:px-4 rounded-lg text-xs sm:text-sm text-white font-medium transition-all disabled:opacity-50 btn-primary shadow-sm"
        >
          {loading === "smart" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading === "smart" ? "В фоне…" : "Подобрать закупки"}
        </button>
        <button
          type="button"
          onClick={() => runSync("catalog")}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] sm:text-xs text-slate-600 bg-white hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <Database size={12} />
          {loading === "catalog" ? "…" : "+ каталог"}
        </button>
      </div>
      {!compact && (
        <p className="text-[10px] text-slate-500 mt-1.5 text-right max-w-sm ml-auto leading-relaxed hidden lg:block">
          Ручной запуск или авто каждые ~20 мин — можно работать с документами параллельно
        </p>
      )}
      {bgProgress && (
        <p className="text-xs text-blue-700 mt-2 flex items-center gap-1 justify-end">
          <Loader2 size={12} className="animate-spin shrink-0" /> {bgProgress}
        </p>
      )}
      {message && !bgProgress && (
        <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1 justify-end">
          <CheckCircle size={12} /> {message}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 mt-2 flex items-center gap-1 justify-end">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Статус автообновления (только чтение).
 * Синк и разбор ТЗ запускает серверный планировщик — не дублируем POST с клиента.
 */
export function BackgroundAutoSync() {
  return null;
}

export function AutoSyncIndicator() {
  const [label, setLabel] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/tenders/auto-sync");
        const data = await res.json();
        if (cancelled) return;
        setRunning(data.running === true);
        if (data.running) {
          setLabel("обновление базы…");
        } else if (data.ago) {
          setLabel(`авто: ${data.ago}`);
        } else if (data.due) {
          setLabel("авто: скоро");
        } else {
          setLabel(`авто: каждые ${data.intervalMinutes || 20} мин`);
        }
      } catch {
        if (!cancelled) setLabel(null);
      }
    }

    void load();
    const id = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <RefreshCw size={11} className={running ? "animate-spin text-blue-600" : ""} />
      {label}
    </span>
  );
}

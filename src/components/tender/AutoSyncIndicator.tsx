"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/** Клиентский дубль: раз в минуту проверяет CD (основной планировщик — на сервере) */
const CLIENT_POLL_MS = 60_000;

/** Тихо запускает автообновление при открытии приложения и каждую минуту (с учётом CD) */
export function BackgroundAutoSync() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tick = () => {
      void fetch("/api/tenders/auto-sync", { method: "POST" }).catch(() => {});
    };

    tick();
    const id = setInterval(tick, CLIENT_POLL_MS);
    return () => clearInterval(id);
  }, []);

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
    const id = setInterval(load, 60_000);
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

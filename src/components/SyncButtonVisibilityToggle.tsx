"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  readSyncButtonVisible,
  writeSyncButtonVisible,
} from "@/lib/syncButtonVisibility";

export default function SyncButtonVisibilityToggle() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setVisible(readSyncButtonVisible());
    setMounted(true);
  }, []);

  function toggle() {
    const next = !visible;
    setVisible(next);
    writeSyncButtonVisible(next);
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-6 app-card mb-6">
      <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <RefreshCw size={18} className="text-blue-600" /> Обновление тендеров
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Тендеры и так обновляются автоматически, примерно раз в 20 минут. Кнопка «Подобрать
        закупки» на странице тендеров нужна только если хочется обновить прямо сейчас, не дожидаясь автосинка.
      </p>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm text-slate-800">Показывать кнопку ручного обновления</span>
          <p className="text-xs text-slate-500 mt-0.5">
            Выключено — кнопки нет на странице тендеров. Включено — можно запустить обновление вручную.
          </p>
        </div>
        <button
          type="button"
          disabled={!mounted}
          onClick={toggle}
          aria-pressed={visible}
          className={`w-8 h-4 rounded-full relative transition-all shrink-0 mt-0.5 ${
            visible && mounted ? "bg-emerald-500" : "bg-slate-600"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
              visible ? "right-0.5" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

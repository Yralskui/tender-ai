"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  score: number | null;
  tenderId: string | null;
  read: boolean;
  time: string;
}

function iconForType(type: string): string {
  switch (type) {
    case "coverage_high":
    case "match_high":
      return "✅";
    case "title_keyword":
      return "🔍";
    case "deadline":
      return "⏰";
    case "doc_expiry":
      return "⚠️";
    default:
      return "🔔";
  }
}

export default function NotificationBell() {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    router.refresh();
  }

  function onItemClick(n: NotificationItem) {
    if (!n.read) markRead(n.id);
    setOpen(false);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative w-10 h-10 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
        aria-label="Уведомления"
        title="Уведомления"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,380px)] rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Уведомления</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <CheckCheck size={12} /> Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Загрузка…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Пока пусто. После синхронизации здесь появятся подходящие тендеры.
              </p>
            ) : (
              items.slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-slate-50 last:border-0 ${n.read ? "opacity-70" : "bg-blue-50/40 dark:bg-blue-500/5"}`}
                >
                  {n.tenderId ? (
                    <Link
                      href={`/tenders/${n.tenderId}`}
                      onClick={() => onItemClick(n)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <NotificationRow n={n} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <NotificationRow n={n} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/80 dark:bg-slate-800/30">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-1 py-1"
            >
              Все уведомления и настройки <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n }: { n: NotificationItem }) {
  return (
    <>
      <span className="text-base shrink-0 mt-0.5">{iconForType(n.type)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`text-sm font-medium truncate ${n.read ? "text-slate-600" : "text-slate-900"}`}>
            {n.title}
          </p>
          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
        </div>
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.body}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-400">{n.time}</span>
          {n.score != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold score-green">
              {Math.round(n.score)}%
            </span>
          )}
        </div>
      </div>
    </>
  );
}

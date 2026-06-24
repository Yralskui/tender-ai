"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
    case "match_high":
      return "✅";
    case "deadline":
      return "⏰";
    case "doc_expiry":
      return "⚠️";
    default:
      return "🔔";
  }
}

export default function NotificationHistory({ items }: { items: NotificationItem[] }) {
  const router = useRouter();

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    router.refresh();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500 app-card">
        Пока нет уведомлений. После автосинхронизации или «Подобрать закупки» здесь появятся подходящие
        тендеры и напоминания.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">История</h2>
        <button
          type="button"
          onClick={markAllRead}
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          Отметить все прочитанными
        </button>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => !n.read && markRead(n.id)}
            onKeyDown={(e) => e.key === "Enter" && !n.read && markRead(n.id)}
            className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
              n.read ? "border-slate-200 opacity-70" : "border-slate-300"
            }`}
            style={{ background: n.read ? "var(--surface-muted)" : "var(--surface)" }}
          >
            <div className="text-xl shrink-0 mt-0.5">{iconForType(n.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {n.tenderId ? (
                  <Link
                    href={`/tenders/${n.tenderId}`}
                    className={`text-sm font-medium hover:underline ${n.read ? "text-slate-600" : "text-slate-900"}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {n.title}
                  </Link>
                ) : (
                  <p className={`text-sm font-medium ${n.read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                )}
                {n.score != null && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${n.score >= 80 ? "score-green" : "score-yellow"}`}
                  >
                    {Math.round(n.score)}%
                  </span>
                )}
                {!n.read && <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{n.body}</p>
            </div>
            <p className="text-xs text-slate-600 shrink-0 mt-0.5">{n.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  score: number | null;
  tenderId: string | null;
  read: boolean;
  time: string;
  createdAt: string;
}

type DateGroupKey = "today" | "yesterday" | "week" | "older";

const GROUP_ORDER: DateGroupKey[] = ["today", "yesterday", "week", "older"];

const GROUP_LABELS: Record<DateGroupKey, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "На этой неделе",
  older: "Ранее",
};

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

function getDateGroup(iso: string): DateGroupKey {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (date >= startOfToday) return "today";
  if (date >= startOfYesterday) return "yesterday";
  if (date >= startOfWeek) return "week";
  return "older";
}

function groupItems(items: NotificationItem[]): Map<DateGroupKey, NotificationItem[]> {
  const map = new Map<DateGroupKey, NotificationItem[]>();
  for (const key of GROUP_ORDER) map.set(key, []);
  for (const item of items) {
    const group = getDateGroup(item.createdAt);
    map.get(group)!.push(item);
  }
  return map;
}

interface Props {
  items: NotificationItem[];
  /** Весь блок свёрнут по умолчанию */
  defaultCollapsed?: boolean;
  /** Заголовок секции */
  title?: string;
}

export default function NotificationHistory({
  items,
  defaultCollapsed = false,
  title = "История",
}: Props) {
  const router = useRouter();
  const [sectionOpen, setSectionOpen] = useState(!defaultCollapsed);
  const [openGroups, setOpenGroups] = useState<Set<DateGroupKey>>(() => new Set(["today"]));

  const grouped = useMemo(() => groupItems(items), [items]);
  const unread = items.filter((n) => !n.read).length;
  const nonEmptyGroups = GROUP_ORDER.filter((k) => (grouped.get(k)?.length ?? 0) > 0);

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

  function toggleGroup(key: DateGroupKey) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    <div className="rounded-2xl border border-slate-200 app-card overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
      >
        {sectionOpen ? (
          <ChevronDown size={18} className="text-slate-500 shrink-0" />
        ) : (
          <ChevronRight size={18} className="text-slate-500 shrink-0" />
        )}
        <h2 className="font-semibold text-slate-900 flex-1">{title}</h2>
        <span className="text-xs text-slate-500">{items.length}</span>
        {unread > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white bg-red-500">{unread}</span>
        )}
      </button>

      {sectionOpen && (
        <div className="border-t border-slate-100 px-3 pb-3">
          <div className="flex justify-end px-2 pt-2 pb-1">
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Отметить все прочитанными
            </button>
          </div>

          <div className="space-y-1">
            {nonEmptyGroups.map((groupKey) => {
              const groupItems = grouped.get(groupKey)!;
              const groupUnread = groupItems.filter((n) => !n.read).length;
              const isOpen = openGroups.has(groupKey);

              return (
                <div key={groupKey} className="rounded-xl border border-slate-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-slate-50/60 dark:bg-slate-800/20 hover:bg-slate-100/80 transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown size={14} className="text-slate-500 shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-500 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex-1">
                      {GROUP_LABELS[groupKey]}
                    </span>
                    <span className="text-xs text-slate-400">{groupItems.length}</span>
                    {groupUnread > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-slate-50">
                      {groupItems.map((n) => (
                        <NotificationRow key={n.id} n={n} onMarkRead={markRead} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onMarkRead,
}: {
  n: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !n.read && onMarkRead(n.id)}
      onKeyDown={(e) => e.key === "Enter" && !n.read && onMarkRead(n.id)}
      className={`flex items-start gap-3 px-3 py-3 transition-all cursor-pointer hover:bg-slate-50/50 ${
        n.read ? "opacity-70" : ""
      }`}
      style={{ background: n.read ? undefined : "var(--surface)" }}
    >
      <div className="text-lg shrink-0 mt-0.5">{iconForType(n.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {n.tenderId ? (
            <Link
              href={`/tenders/${n.tenderId}`}
              className={`text-sm font-medium hover:underline truncate ${n.read ? "text-slate-600" : "text-slate-900"}`}
              onClick={(e) => e.stopPropagation()}
            >
              {n.title}
            </Link>
          ) : (
            <p className={`text-sm font-medium truncate ${n.read ? "text-slate-600" : "text-slate-900"}`}>
              {n.title}
            </p>
          )}
          {n.score != null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${n.score >= 80 ? "score-green" : "score-yellow"}`}
            >
              {Math.round(n.score)}%
            </span>
          )}
          {!n.read && <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.body}</p>
      </div>
      <p className="text-xs text-slate-400 shrink-0 mt-0.5">{n.time}</p>
    </div>
  );
}

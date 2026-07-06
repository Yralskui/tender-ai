"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Plus, Settings2, Trash2, X } from "lucide-react";

export const LABEL_COLOR_PRESETS = [
  "#2563eb",
  "#d97706",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#64748b",
  "#ea580c",
  "#4f46e5",
] as const;

export interface TenderLabelRow {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Props {
  labels: TenderLabelRow[];
  feedMode: string;
  activeTagId?: string;
  taggedTotal: number;
}

export default function TenderLabelsBar({
  labels,
  feedMode,
  activeTagId,
  taggedTotal,
}: Props) {
  const router = useRouter();
  const [manageOpen, setManageOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(LABEL_COLOR_PRESETS[0]);
  const [showAdd, setShowAdd] = useState(false);

  const isTaggedView = feedMode === "tagged" || !!activeTagId;

  async function createLabel() {
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    try {
      const res = await fetch("/api/tender-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) return;
      setNewName("");
      setShowAdd(false);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function updateColor(labelId: string, color: string) {
    setBusyId(labelId);
    try {
      const res = await fetch(`/api/tender-labels/${labelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLabel(labelId: string, name: string) {
    if (!confirm(`Удалить метку «${name}»? Назначения с тендеров тоже снимутся.`)) return;
    setBusyId(labelId);
    try {
      const res = await fetch(`/api/tender-labels/${labelId}`, { method: "DELETE" });
      if (!res.ok) return;
      if (activeTagId === labelId) {
        router.push(`/tenders?view=${feedMode === "tagged" ? "tagged" : feedMode}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  if (labels.length === 0 && taggedTotal === 0) return null;

  const activeLabel = activeTagId ? labels.find((l) => l.id === activeTagId) : undefined;
  const sameAsAllTagged =
    activeLabel && activeLabel.count > 0 && activeLabel.count === taggedTotal;

  return (
    <div className={`mt-2 space-y-2 rounded-xl p-2 -mx-2 ${isTaggedView ? "bg-amber-50/80 border border-amber-100" : ""}`}>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-slate-500 mr-0.5">Метки:</span>
        <Link
          href={`/tenders?view=${feedMode === "tagged" ? "matched" : feedMode}`}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            !isTaggedView
              ? "bg-slate-100 border-slate-300 text-slate-800 font-medium"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Все
        </Link>
        <Link
          href={`/tenders?view=tagged`}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            feedMode === "tagged" && !activeTagId
              ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          С метками{taggedTotal > 0 ? ` (${taggedTotal})` : ""}
        </Link>
        {labels.map((label) => (
          <Link
          key={label.id}
          href={`/tenders?view=tagged&tag=${label.id}`}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors inline-flex items-center gap-1 ${
              activeTagId === label.id
                ? "text-white font-medium border-transparent"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            style={
              activeTagId === label.id
                ? { backgroundColor: label.color, borderColor: label.color }
                : undefined
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: activeTagId === label.id ? "rgba(255,255,255,0.9)" : label.color,
              }}
            />
            {label.name}
            {label.count > 0 && <span className="opacity-75">({label.count})</span>}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen((v) => !v)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 inline-flex items-center gap-1"
        >
          <Settings2 size={11} />
          {manageOpen ? "Скрыть" : "Управление"}
        </button>
      </div>

      {sameAsAllTagged && (
        <p className="text-[10px] text-amber-800/90 leading-snug px-0.5">
          На этих {taggedTotal} закупках стоят и другие метки — список совпадает с «С метками».
        </p>
      )}

      {manageOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 max-w-lg">
          <p className="text-xs text-slate-600">
            Метки сохраняются на тендерах. Раздел «С метками» показывает все помеченные закупки отдельно от основной ленты.
          </p>
          <ul className="space-y-2">
            {labels.map((label) => (
              <li
                key={label.id}
                className="flex flex-wrap items-center gap-2 text-xs border-b border-slate-100 pb-2 last:border-0 last:pb-0"
              >
                <span className="font-medium text-slate-800 min-w-[80px]">{label.name}</span>
                <span className="text-slate-400">{label.count} тендеров</span>
                <div className="flex flex-wrap gap-1">
                  {LABEL_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={busyId === label.id}
                      onClick={() => updateColor(label.id, c)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                        label.color.toLowerCase() === c.toLowerCase()
                          ? "border-slate-800 scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      title="Цвет метки"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busyId === label.id}
                  onClick={() => deleteLabel(label.id, label.name)}
                  className="ml-auto p-1 text-red-500 hover:bg-red-50 rounded"
                  title="Удалить метку"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {showAdd ? (
            <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Название</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createLabel()}
                  placeholder="Новая метка"
                  className="text-xs px-2 py-1 rounded border border-slate-200 w-36"
                  maxLength={40}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Цвет</label>
                <div className="flex gap-1">
                  {LABEL_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newColor === c ? "border-slate-800" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={createLabel}
                disabled={busyId === "new" || !newName.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white disabled:opacity-50"
              >
                Создать
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setNewName("");
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              <Plus size={12} /> Новая метка
            </button>
          )}
        </div>
      )}
    </div>
  );
}

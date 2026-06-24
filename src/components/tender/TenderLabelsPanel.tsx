"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Plus, Loader2, X } from "lucide-react";
import { LABEL_COLOR_PRESETS } from "@/components/tender/TenderLabelsBar";

interface LabelDto {
  id: string;
  name: string;
  color: string;
}

interface Props {
  tenderId: string;
  initialLabels?: LabelDto[];
  initialAssignedIds?: string[];
}

export default function TenderLabelsPanel({
  tenderId,
  initialLabels = [],
  initialAssignedIds = [],
}: Props) {
  const router = useRouter();
  const [labels, setLabels] = useState<LabelDto[]>(initialLabels);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(initialAssignedIds));
  const [loading, setLoading] = useState(initialLabels.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(LABEL_COLOR_PRESETS[0]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (initialLabels.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tenders/${tenderId}/labels`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setLabels(data.labels || []);
          setAssigned(new Set(data.assignedIds || []));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenderId, initialLabels.length]);

  async function toggleLabel(labelId: string) {
    const isOn = assigned.has(labelId);
    setBusyId(labelId);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId, action: isOn ? "remove" : "toggle" }),
      });
      if (!res.ok) return;
      setAssigned((prev) => {
        const next = new Set(prev);
        if (isOn) next.delete(labelId);
        else next.add(labelId);
        return next;
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

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
      const data = await res.json();
      if (!res.ok || !data.label) return;
      setLabels((prev) => [...prev, data.label]);
      setNewName("");
      setShowAdd(false);
      await toggleLabel(data.label.id);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Метки…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 mr-1">
        <Tag size={11} /> Метки
      </span>
      {labels.map((label) => {
        const active = assigned.has(label.id);
        return (
          <button
            key={label.id}
            type="button"
            disabled={busyId === label.id}
            onClick={() => toggleLabel(label.id)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              active
                ? "text-white border-transparent"
                : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
            }`}
            style={active ? { backgroundColor: label.color, borderColor: label.color } : undefined}
          >
            {busyId === label.id ? "…" : label.name}
          </button>
        );
      })}
      {showAdd ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createLabel()}
            placeholder="Новая метка"
            className="text-[10px] px-2 py-0.5 rounded border border-slate-200 w-24"
            maxLength={40}
          />
          <span className="inline-flex gap-0.5">
            {LABEL_COLOR_PRESETS.slice(0, 6).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-4 h-4 rounded-full border ${
                  newColor === c ? "border-slate-800" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
          <button
            type="button"
            onClick={createLabel}
            disabled={busyId === "new"}
            className="text-[10px] text-blue-600"
          >
            OK
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400">
            <X size={12} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="text-[10px] px-1.5 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 inline-flex items-center gap-0.5"
        >
          <Plus size={10} /> метка
        </button>
      )}
    </div>
  );
}

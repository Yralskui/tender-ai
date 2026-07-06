"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import {
  COVERAGE_THRESHOLD_OPTIONS,
  type CoverageThreshold,
  type DigestFrequency,
} from "@/lib/notificationPreferences";
import { INCLUDE_KEYWORD_PRESETS } from "@/lib/tenderFeedFilters";

export interface NotificationPrefsState {
  notifyNewTenders: boolean;
  notifyHighMatch: boolean;
  notifyDeadline: boolean;
  notifyDocExpiry: boolean;
  matchThreshold: CoverageThreshold;
  notifyTitleKeywords: boolean;
  titleKeywords: string;
  digestFrequency?: DigestFrequency;
}

interface Props {
  initialPrefs: NotificationPrefsState;
  /** Показывать дедлайн/документы и частоту рассылки (страница /notifications) */
  showServiceToggles?: boolean;
  /** Email должен быть включён, чтобы тогглы были активны */
  emailEnabled?: boolean;
  compact?: boolean;
}

const SERVICE_TOGGLES: Array<{ key: keyof NotificationPrefsState; label: string }> = [
  { key: "notifyDeadline", label: "Дедлайн через 3 дня" },
  { key: "notifyDocExpiry", label: "Истечение документов" },
];

const DIGEST_OPTIONS: Array<{ value: DigestFrequency; label: string }> = [
  { value: "instant", label: "Сразу" },
  { value: "daily", label: "Раз в день" },
  { value: "weekly", label: "Раз в неделю" },
];

export default function NotificationPrefsPanel({
  initialPrefs,
  showServiceToggles = false,
  emailEnabled = true,
  compact = false,
}: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [keywordDraft, setKeywordDraft] = useState(initialPrefs.titleKeywords);
  const [saving, setSaving] = useState(false);

  async function patch(updates: Partial<NotificationPrefsState>) {
    setSaving(true);
    const next = { ...prefs, ...updates };
    setPrefs(next);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function toggleKeywordPreset(word: string) {
    const parts = keywordDraft
      .split(/[,;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2);
    const set = new Set(parts);
    if (set.has(word)) set.delete(word);
    else set.add(word);
    const titleKeywords = [...set].join(", ");
    setKeywordDraft(titleKeywords);
    patch({ titleKeywords, notifyTitleKeywords: prefs.notifyTitleKeywords });
  }

  function applyKeywordDraft() {
    const titleKeywords = keywordDraft
      .split(/[,;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2)
      .join(", ");
    setKeywordDraft(titleKeywords);
    patch({ titleKeywords });
  }

  const disabled = !emailEnabled || saving;

  return (
    <div className={`rounded-2xl border border-slate-200 p-5 app-card ${compact ? "" : "mb-6"}`}>
      <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Bell size={18} className="text-blue-600" /> Какие уведомления присылать
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Настройки тендеров сохраняются в профиле. Email и дайджест — на странице «Уведомления».
      </p>

      <div className="space-y-4">
        <ToggleRow
          label="Новые тендеры по профилю"
          hint="Попадают в ленту «Подходящие» с оценкой от 40%"
          enabled={prefs.notifyNewTenders}
          disabled={disabled}
          onToggle={() => patch({ notifyNewTenders: !prefs.notifyNewTenders })}
        />

        <div className="rounded-xl border border-slate-200 p-3">
          <ToggleRow
            label="Покрытие ТЗ в РУ"
            hint="Уведомление, когда шанс покрытия номенклатуры выше выбранного порога"
            enabled={prefs.notifyHighMatch}
            disabled={disabled}
            onToggle={() => patch({ notifyHighMatch: !prefs.notifyHighMatch })}
          />
          {prefs.notifyHighMatch && (
            <div className="mt-3 flex flex-wrap gap-2">
              {COVERAGE_THRESHOLD_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ matchThreshold: pct })}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    prefs.matchThreshold === pct
                      ? "border-emerald-500/60 text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  ≥ {pct}%
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <ToggleRow
            label="Слово в названии закупки"
            hint="Как фильтр ленты: уведомление, если в названии есть одно из слов"
            enabled={prefs.notifyTitleKeywords}
            disabled={disabled}
            onToggle={() => patch({ notifyTitleKeywords: !prefs.notifyTitleKeywords })}
          />
          {prefs.notifyTitleKeywords && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {INCLUDE_KEYWORD_PRESETS.map((w) => {
                  const active = keywordDraft
                    .toLowerCase()
                    .split(/[,;]+/)
                    .map((s) => s.trim())
                    .includes(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleKeywordPreset(w)}
                      className={`text-xs px-2 py-1 rounded-full border transition-all ${
                        active
                          ? "border-blue-500/50 text-blue-700 bg-blue-50 dark:bg-blue-500/10"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  placeholder="марл, халат, маск…"
                  disabled={disabled}
                  className="flex-1 px-3 py-2 rounded-lg app-input text-sm"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={applyKeywordDraft}
                  className="px-3 py-2 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                >
                  <Search size={12} /> Применить
                </button>
              </div>
              <p className="text-xs text-slate-500">Через запятую. Минимум 2 символа в слове.</p>
            </div>
          )}
        </div>

        {showServiceToggles &&
          SERVICE_TOGGLES.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              enabled={prefs[t.key] as boolean}
              disabled={disabled}
              onToggle={() => patch({ [t.key]: !prefs[t.key] })}
            />
          ))}
      </div>

      {showServiceToggles && prefs.digestFrequency != null && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-700 mb-2">Частота email-рассылки</p>
          <div className="flex gap-2">
            {DIGEST_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => patch({ digestFrequency: opt.value })}
                className={`flex-1 py-2 rounded-xl text-sm border transition-all ${
                  prefs.digestFrequency === opt.value
                    ? "border-blue-500/50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
                style={{
                  background: prefs.digestFrequency === opt.value ? "rgba(59,130,246,0.1)" : "transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="text-sm text-slate-800">{label}</span>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`w-8 h-4 rounded-full relative transition-all shrink-0 mt-0.5 ${
          enabled && !disabled ? "bg-emerald-500" : "bg-slate-600"
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
            enabled ? "right-0.5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

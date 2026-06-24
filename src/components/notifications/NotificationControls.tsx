"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Settings, Send, RefreshCw } from "lucide-react";
import type { DigestFrequency } from "@/lib/notificationService";

interface Prefs {
  email: string;
  emailEnabled: boolean;
  notifyNewTenders: boolean;
  notifyHighMatch: boolean;
  notifyDeadline: boolean;
  notifyDocExpiry: boolean;
  matchThreshold: number;
  digestFrequency: DigestFrequency;
}

const TOGGLES: Array<{ key: keyof Prefs; label: string }> = [
  { key: "notifyNewTenders", label: "Новые тендеры по профилю" },
  { key: "notifyHighMatch", label: "Тендер с совпадением >70%" },
  { key: "notifyDeadline", label: "Дедлайн через 3 дня" },
  { key: "notifyDocExpiry", label: "Истечение документов" },
];

const DIGEST_OPTIONS: Array<{ value: DigestFrequency; label: string }> = [
  { value: "instant", label: "Сразу" },
  { value: "daily", label: "Раз в день" },
  { value: "weekly", label: "Раз в неделю" },
];

export default function NotificationControls({
  initialPrefs,
  pendingEmailCount = 0,
}: {
  initialPrefs: Prefs;
  pendingEmailCount?: number;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  async function patch(updates: Partial<Prefs>) {
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

  async function sendTestEmail() {
    setTestStatus("Отправка…");
    const res = await fetch("/api/notifications/test-email", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setTestStatus(`✓ Письмо отправлено на ${data.to}${data.via ? ` (${data.via})` : ""}. Проверьте входящие и спам.`);
    } else {
      setTestStatus(`✗ Не удалось: ${data.error || "ошибка SMTP"}. Смотрите терминал npm run dev.`);
    }
  }

  async function resendPending() {
    setResendStatus("Отправка…");
    const res = await fetch("/api/notifications/test-email", { method: "PUT" });
    const data = await res.json();
    if (data.sent > 0) {
      setResendStatus(`✓ Отправлено писем: ${data.sent}${data.failed ? `, ошибок: ${data.failed}` : ""}`);
    } else if (data.failed > 0) {
      setResendStatus(`✗ Не удалось отправить (${data.failed}). Проверьте SMTP в .env`);
    } else {
      setResendStatus("Нет неотправленных уведомлений");
    }
    router.refresh();
  }

  return (
    <>
      <div className="mb-8">
        <div className="rounded-2xl border border-slate-200 p-5 app-card">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.15)" }}
            >
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Email</p>
              <p className="text-xs text-slate-500">Письма приходят на: {prefs.email}</p>
            </div>
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => patch({ emailEnabled: !prefs.emailEnabled })}
                className={`text-xs px-2 py-1 rounded-full ${prefs.emailEnabled ? "score-green" : "score-red"}`}
              >
                {prefs.emailEnabled ? "Активен" : "Выключен"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Отправитель в .env (tender-ai@bk.ru) — только технический. Вам приходит на адрес регистрации выше.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={sendTestEmail}
              disabled={!prefs.emailEnabled}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send size={12} /> Тестовое письмо
            </button>
            {pendingEmailCount > 0 && (
              <button
                type="button"
                onClick={resendPending}
                disabled={!prefs.emailEnabled}
                className="text-xs px-3 py-2 rounded-lg border border-amber-400/50 text-amber-700 hover:bg-amber-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={12} /> Отправить накопившиеся ({pendingEmailCount})
              </button>
            )}
          </div>
          {testStatus && <p className="text-xs text-slate-600 mb-2">{testStatus}</p>}
          {resendStatus && <p className="text-xs text-slate-600 mb-2">{resendStatus}</p>}
          <div className="space-y-2">
            {TOGGLES.map((t) => {
              const enabled = prefs[t.key] as boolean;
              return (
                <div key={t.key} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">{t.label}</span>
                  <button
                    type="button"
                    disabled={!prefs.emailEnabled || saving}
                    onClick={() => patch({ [t.key]: !enabled })}
                    className={`w-8 h-4 rounded-full relative transition-all ${enabled && prefs.emailEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${enabled ? "right-0.5" : "left-0.5"}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 p-5 app-card">
        <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Settings size={16} className="text-slate-600" /> Частота рассылки
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          «Сразу» — письмо при каждом уведомлении. «Раз в день/неделю» — дайджест по cron.
        </p>
        <div className="flex gap-2">
          {DIGEST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={!prefs.emailEnabled || saving}
              onClick={() => patch({ digestFrequency: opt.value })}
              className={`flex-1 py-2.5 rounded-xl text-sm border transition-all ${
                prefs.digestFrequency === opt.value
                  ? "border-blue-500/50 text-blue-300"
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
    </>
  );
}

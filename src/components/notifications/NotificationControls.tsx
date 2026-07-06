"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, RefreshCw } from "lucide-react";
import NotificationPrefsPanel, {
  type NotificationPrefsState,
} from "@/components/notifications/NotificationPrefsPanel";
import { normalizeCoverageThreshold } from "@/lib/notificationPreferences";

interface Prefs extends NotificationPrefsState {
  email: string;
  emailEnabled: boolean;
}

export default function NotificationControls({
  initialPrefs,
  pendingEmailCount = 0,
}: {
  initialPrefs: Prefs;
  pendingEmailCount?: number;
}) {
  const router = useRouter();
  const [emailEnabled, setEmailEnabled] = useState(initialPrefs.emailEnabled);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  async function patchEmailEnabled(next: boolean) {
    setSaving(true);
    setEmailEnabled(next);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailEnabled: next }),
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

  const prefsState: NotificationPrefsState = {
    notifyNewTenders: initialPrefs.notifyNewTenders,
    notifyHighMatch: initialPrefs.notifyHighMatch,
    notifyDeadline: initialPrefs.notifyDeadline,
    notifyDocExpiry: initialPrefs.notifyDocExpiry,
    matchThreshold: normalizeCoverageThreshold(initialPrefs.matchThreshold),
    notifyTitleKeywords: initialPrefs.notifyTitleKeywords,
    titleKeywords: initialPrefs.titleKeywords,
    digestFrequency: initialPrefs.digestFrequency,
  };

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
              <p className="text-xs text-slate-500">Письма приходят на: {initialPrefs.email}</p>
            </div>
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => patchEmailEnabled(!emailEnabled)}
                disabled={saving}
                className={`text-xs px-2 py-1 rounded-full ${emailEnabled ? "score-green" : "score-red"}`}
              >
                {emailEnabled ? "Активен" : "Выключен"}
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
              disabled={!emailEnabled}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send size={12} /> Тестовое письмо
            </button>
            {pendingEmailCount > 0 && (
              <button
                type="button"
                onClick={resendPending}
                disabled={!emailEnabled}
                className="text-xs px-3 py-2 rounded-lg border border-amber-400/50 text-amber-700 hover:bg-amber-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={12} /> Отправить накопившиеся ({pendingEmailCount})
              </button>
            )}
          </div>
          {testStatus && <p className="text-xs text-slate-600 mb-2">{testStatus}</p>}
          {resendStatus && <p className="text-xs text-slate-600 mb-2">{resendStatus}</p>}
        </div>
      </div>

      <NotificationPrefsPanel
        initialPrefs={prefsState}
        showServiceToggles
        emailEnabled={emailEnabled}
      />
    </>
  );
}

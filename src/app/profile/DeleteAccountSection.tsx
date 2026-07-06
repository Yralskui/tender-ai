"use client";

import { useState } from "react";
import { Loader2, Trash2, AlertTriangle, X } from "lucide-react";

type Props = {
  email: string;
};

export default function DeleteAccountSection({ email }: Props) {
  const [step, setStep] = useState<null | 1 | 2 | "sent">(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devDeleteUrl, setDevDeleteUrl] = useState("");

  async function handleRequestDeletion() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-account-deletion", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось отправить письмо");
        return;
      }
      setMessage(data.message || "Письмо отправлено");
      if (data.devDeleteUrl) setDevDeleteUrl(data.devDeleteUrl);
      setStep("sent");
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setStep(null);
    setError("");
    setMessage("");
    setDevDeleteUrl("");
  }

  return (
    <>
      <section className="rounded-2xl border-2 border-red-200 dark:border-red-800 p-6 bg-red-50 dark:bg-red-950/30">
        <h2 className="font-semibold text-red-800 dark:text-red-300 mb-2 flex items-center gap-2">
          <AlertTriangle size={18} /> Удаление аккаунта
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
          Необратимо удалит профиль, документы, прайсы и историю совпадений. Сначала придёт письмо со ссылкой — аккаунт
          удалится только после перехода по ней.
        </p>
        <button type="button" onClick={() => setStep(1)} className="btn-danger px-5 py-3 text-sm">
          <Trash2 size={16} /> Удалить аккаунт
        </button>
      </section>

      {step !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={closeModal}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {step === "sent" ? "Письмо отправлено" : "Удаление аккаунта"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {step === 1 && (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">
                  Вы собираетесь удалить аккаунт{" "}
                  <strong className="text-slate-900 dark:text-white">{email}</strong>. Все данные будут удалены без
                  возможности восстановления.
                </p>
                <div className="flex flex-wrap gap-3 justify-end">
                  <button type="button" onClick={closeModal} className="btn-cancel px-4 py-2.5 text-sm">
                    Отмена
                  </button>
                  <button type="button" onClick={() => setStep(2)} className="btn-danger px-4 py-2.5 text-sm">
                    Продолжить
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                  <strong className="text-red-700 dark:text-red-400">Точно удалить аккаунт?</strong>
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">
                  На <strong className="text-slate-900 dark:text-white">{email}</strong> придёт письмо со ссылкой.
                  Аккаунт удалится только после перехода по ней.
                </p>
                {error && (
                  <div className="mb-4 p-3 rounded-xl text-sm text-red-800 dark:text-red-300 border border-red-300 bg-red-50 dark:bg-red-950/50">
                    {error}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 justify-end">
                  <button type="button" onClick={closeModal} disabled={loading} className="btn-cancel px-4 py-2.5 text-sm">
                    Отмена
                  </button>
                  <button type="button" onClick={handleRequestDeletion} disabled={loading} className="btn-danger px-4 py-2.5 text-sm">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    Да, отправить письмо
                  </button>
                </div>
              </>
            )}

            {step === "sent" && (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{message}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">
                  Проверьте почту <strong className="text-slate-900 dark:text-white">{email}</strong> (и папку «Спам»).
                  Перейдите по ссылке в письме — только тогда аккаунт будет удалён окончательно.
                </p>
                {devDeleteUrl && (
                  <div className="mb-4 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 break-all">
                    <p className="font-medium mb-1">Режим разработки — ссылка для удаления:</p>
                    <a href={devDeleteUrl} className="text-blue-600 dark:text-blue-400 underline">
                      {devDeleteUrl}
                    </a>
                  </div>
                )}
                <button type="button" onClick={closeModal} className="btn-cancel w-full px-4 py-2.5 text-sm">
                  Понятно
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

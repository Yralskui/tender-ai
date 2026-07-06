"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap, Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";
  const devLinkParam = searchParams.get("devLink") || "";
  const verified = searchParams.get("verified") === "1";
  const errorParam = searchParams.get("error");
  const expired = searchParams.get("expired") === "1";

  const [email, setEmail] = useState(emailParam);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devVerifyUrl, setDevVerifyUrl] = useState(devLinkParam);

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
  }, [emailParam]);

  useEffect(() => {
    if (devLinkParam) setDevVerifyUrl(devLinkParam);
  }, [devLinkParam]);

  useEffect(() => {
    if (verified) {
      const t = setTimeout(() => {
        window.location.assign("/onboarding");
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [verified]);

  useEffect(() => {
    if (!errorParam) return;
    try {
      setError(decodeURIComponent(errorParam));
    } catch {
      setError(errorParam === "missing" ? "Ссылка подтверждения неполная" : "Ошибка подтверждения");
    }
  }, [errorParam]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось отправить письмо");
        return;
      }
      setMessage(data.message || "Письмо отправлено");
      if (data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Email подтверждён</h1>
        <p className="text-slate-600 mb-6">Перенаправляем в личный кабинет…</p>
        <Link href="/onboarding" className="text-blue-600 hover:text-blue-800 font-medium">
          Перейти сейчас
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
        <Mail size={32} className="text-blue-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Подтвердите email</h1>
      <p className="text-slate-600 text-center mb-6">
        Мы отправили письмо со ссылкой для подтверждения.
        {emailParam ? (
          <>
            {" "}
            Адрес: <span className="font-medium text-slate-800">{emailParam}</span>
          </>
        ) : null}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm text-red-600 border border-red-500/30 flex gap-2" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {devVerifyUrl && (
        <div className="mb-4 p-4 rounded-lg text-sm border border-amber-500/40 bg-amber-50 text-amber-900">
          <p className="font-medium mb-2">Режим разработки — письмо не ушло через SMTP</p>
          <p className="text-amber-800 mb-3 text-xs">
            Mail.ru требует пароль приложения. Пока SMTP не настроен, подтвердите email по ссылке:
          </p>
          <a
            href={devVerifyUrl}
            className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 break-all"
          >
            Подтвердить email
          </a>
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm text-emerald-700 border border-emerald-500/30" style={{ background: "rgba(16,185,129,0.1)" }}>
          {message}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-6 app-card">
        <p className="text-sm text-slate-600 mb-4">
          {expired
            ? "Ссылка истекла. Запросите новое письмо:"
            : "Не пришло письмо? Проверьте папку «Спам» или запросите повторно:"}
        </p>
        <form onSubmit={handleResend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="company@example.ru"
              className="w-full px-4 py-3 rounded-xl app-input text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 btn-primary"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : "Отправить письмо снова"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-slate-600 mt-6">
        <Link href="/auth/login" className="text-blue-600 hover:text-blue-800 font-medium">
          Вернуться ко входу
        </Link>
      </p>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 app-shell">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center btn-primary">
              <Zap size={20} className="text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">TenderAI</span>
          </Link>
        </div>
        <Suspense fallback={<div className="text-center text-slate-500">Загрузка…</div>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}

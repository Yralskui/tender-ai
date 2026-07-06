"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap, CheckCircle, AlertCircle, Heart, Sparkles, Home } from "lucide-react";

function AccountDeletedContent() {
  const searchParams = useSearchParams();
  const deleted = searchParams.get("deleted") === "1";
  const errorParam = searchParams.get("error");
  const expired = searchParams.get("expired") === "1";

  let error = "";
  if (errorParam) {
    try {
      error = decodeURIComponent(errorParam);
    } catch {
      error = errorParam === "missing" ? "Ссылка неполная" : "Не удалось удалить аккаунт";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 app-shell relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(26,109,242,0.18), transparent), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(13,159,110,0.12), transparent)",
        }}
      />

      <div className="w-full max-w-lg text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center btn-primary shadow-md">
            <Zap size={20} className="text-white" />
          </div>
          <span className="font-bold text-xl text-slate-900 dark:text-white">TenderAI</span>
        </Link>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-600 p-10 app-card shadow-lg">
          {deleted ? (
            <>
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={36} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full mb-4">
                <Sparkles size={12} /> Готово
              </div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Аккаунт удалён</h1>
              <p className="text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
                Ваш профиль и все связанные данные удалены с наших серверов. Спасибо, что были с TenderAI.
              </p>
              <p className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed flex items-center justify-center gap-2">
                <Heart size={18} className="text-rose-500 shrink-0" />
                <span>Будем рады видеть вас снова — приходите, когда снова понадобятся тендеры.</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <Home size={18} /> На главную
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-medium text-white btn-primary hover:opacity-90"
                >
                  Создать новый аккаунт
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={36} className="text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {expired ? "Ссылка истекла" : "Не удалось удалить аккаунт"}
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                {error || "Ссылка недействительна или уже использована."}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-medium border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  Войти
                </Link>
                {expired && (
                  <Link
                    href="/profile"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-medium text-white btn-primary hover:opacity-90"
                  >
                    Запросить снова
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountDeletedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center app-shell">
          <p className="text-slate-600">Загрузка...</p>
        </div>
      }
    >
      <AccountDeletedContent />
    </Suspense>
  );
}

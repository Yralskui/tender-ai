"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center app-shell p-6">
      <div className="app-card max-w-md w-full p-8 text-center allow-text-select">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={28} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Что-то пошло не так</h1>
        <p className="text-slate-600 mb-6">
          Произошла непредвиденная ошибка. Попробуйте ещё раз — если не поможет, вернитесь на дашборд.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <RotateCcw size={16} />
            Попробовать снова
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            На дашборд
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center app-shell p-6">
      <div className="app-card max-w-md w-full p-8 text-center allow-text-select">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <SearchX size={28} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Страница не найдена</h1>
        <p className="text-slate-600 mb-6">
          Такой страницы нет — возможно, ссылка устарела или тендер был удалён из ленты.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Вернуться на дашборд
        </Link>
      </div>
    </div>
  );
}

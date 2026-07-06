"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Search,
  TrendingUp,
  Settings,
  LogOut,
  Zap,
  Bell,
} from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";

const nav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Дашборд" },
  { href: "/tenders", icon: Search, label: "Тендеры" },
  { href: "/documents", icon: FileText, label: "Документы" },
  { href: "/growth", icon: TrendingUp, label: "Карта роста" },
  { href: "/profile", icon: Settings, label: "Профиль" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <>
      <div className="fixed top-3 right-4 z-50 lg:top-4 lg:right-6">
        <NotificationBell />
      </div>
      <aside className="app-sidebar w-[52px] xl:w-[200px] min-h-screen flex flex-col shrink-0">
      <div className="h-14 flex items-center px-3 xl:px-4 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg btn-primary flex items-center justify-center shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900 text-sm hidden xl:inline truncate">TenderAI</span>
        </Link>
      </div>

      <nav className="flex-1 px-1.5 xl:px-2 py-3 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center xl:justify-start gap-2.5 px-2 xl:px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <item.icon size={17} strokeWidth={active ? 2.25 : 2} className="shrink-0" />
              <span className="hidden xl:inline truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-1.5 xl:p-2 border-t border-slate-100 space-y-0.5">
        <Link
          href="/paywall"
          title="Подписка"
          className="flex items-center justify-center xl:justify-start gap-2 px-2 xl:px-2.5 py-2 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors mb-0.5"
        >
          <Zap size={14} className="shrink-0" />
          <span className="hidden xl:inline">Подписка</span>
        </Link>
        <Link
          href="/notifications"
          title="Уведомления"
          className="flex items-center justify-center xl:justify-start gap-2.5 px-2 xl:px-2.5 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <Bell size={17} className="shrink-0" />
          <span className="hidden xl:inline">Уведомления</span>
        </Link>
        <button
          onClick={handleLogout}
          title="Выйти"
          className="w-full flex items-center justify-center xl:justify-start gap-2.5 px-2 xl:px-2.5 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={17} className="shrink-0" />
          <span className="hidden xl:inline">Выйти</span>
        </button>
      </div>
    </aside>
    </>
  );
}

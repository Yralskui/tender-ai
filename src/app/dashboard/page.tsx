import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import { mapCompanyDocuments } from "@/lib/matching";
import { loadDocumentsForMatching, countRelevantDocuments } from "@/lib/documentQuery";
import Sidebar from "@/components/Sidebar";
import TrialBanner from "@/components/TrialBanner";
import TendersSyncButton from "@/components/TendersSyncButton";
import { loadTenderFeedPage } from "@/lib/tenderFeedPage";
import { createPerfTimer } from "@/lib/perfLog";
import Link from "next/link";
import {
  FileText,
  Search,
  TrendingUp,
  CheckCircle,
  Clock,
  ArrowRight,
  Plus,
} from "lucide-react";

function formatPrice(price: number) {
  if (price >= 1000000) return `${(price / 1000000).toFixed(1)} млн ₽`;
  if (price >= 1000) return `${(price / 1000).toFixed(0)} тыс ₽`;
  return `${price} ₽`;
}

function daysUntil(date: Date | string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function DashboardPage() {
  const perf = createPerfTimer("GET /dashboard");
  const user = await getCurrentUser();
  perf.step("getCurrentUser");
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(user.company?.okvedCodes || "[]");
  } catch {}

  const documents = user.company ? await loadDocumentsForMatching(user.company.id) : [];
  perf.step("documents", { count: documents.length });

  const feedPage = await loadTenderFeedPage({
    okvedCodes,
    documents,
    company: user.company
      ? {
          id: user.company.id,
          revenue: user.company.revenue,
          region: user.company.region,
          description: user.company.description,
        }
      : null,
    feedMode: "matched",
    limit: 5,
  });
  perf.step("feedPage", {
    items: feedPage.items.length,
    cacheBuilding: feedPage.cacheBuilding ?? false,
    totalInDb: feedPage.totalInDb,
  });

  const docCount = documents.length;
  const relevantDocCount = countRelevantDocuments(documents);

  const recentTenders = feedPage.items;
  const medicalTenderCount = feedPage.cacheMatchedCount ?? feedPage.statsShown;
  const totalInDb = feedPage.totalInDb;

  let matchingCount = 0;
  const tendersWithScores = recentTenders.map((tender) => {
    const score = tender.displayScore;
    if (relevantDocCount > 0 && score != null && (score >= 45 || tender.ruMatched > 0)) {
      matchingCount++;
    }
    return { tender, score };
  });

  const nearestDeadline = recentTenders.reduce((min, t) => {
    const d = daysUntil(t.deadline);
    return min === null || d < min ? d : min;
  }, null as number | null);

  const stats = [
    {
      label: "По профилю",
      value: medicalTenderCount,
      hint: feedPage.cacheBuilding ? "строится кэш…" : "в вашей ленте",
      icon: Search,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Документов AI",
      value: relevantDocCount,
      hint: `из ${docCount} загруженных`,
      icon: FileText,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Подходят ≥45%",
      value: relevantDocCount > 0 ? matchingCount : "—",
      hint: "с совпадением в РУ",
      icon: CheckCircle,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Дедлайн",
      value: nearestDeadline !== null ? `${nearestDeadline} дн` : "—",
      hint: "ближайший",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  perf.end("рендер", { tenders: recentTenders.length, totalInDb });

  return (
    <div className="flex min-h-screen bg-[#eef1f6]">
      <Sidebar />
      <main className="app-main min-w-0 p-4 lg:p-6">
        <header className="mb-6 flex items-start justify-between gap-4 pr-14 lg:pr-16">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {user.name || user.email.split("@")[0]}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {user.company?.name || "Заполните профиль"}
              <span className="mx-1.5">·</span>
              <span className="text-emerald-600 font-medium">Поставщик медизделий</span>
              {totalInDb > 0 && (
                <span className="text-slate-400">
                  <span className="mx-1.5">·</span>
                  {totalInDb} закупок в базе
                </span>
              )}
            </p>
          </div>
        </header>

        <TrialBanner daysLeft={access.trialDaysLeft} type={access.type === "trial" ? "trial" : "paid"} plan={access.plan} />

        {feedPage.cacheBuilding && (
          <div className="mb-6 app-card p-4 border border-amber-200 bg-amber-50/60 text-sm text-amber-900">
            Подбираем подходящие закупки по вашему РУ — список обновится через минуту.
          </div>
        )}

        {docCount === 0 && (
          <div className="mb-6 app-card p-5 border border-blue-100 bg-gradient-to-r from-blue-50/80 to-emerald-50/50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 mb-1">Загрузите РУ с приложением</h3>
                <p className="text-sm text-slate-600 mb-3">
                  AI извлечёт каталог изделий и сверит с ТЗ медтендеров с zakupki.gov.ru
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  После загрузки РУ нажмите «Подобрать закупки» на странице тендеров — система сама разберёт ТЗ у лучших закупок.
                </p>
                <Link href="/documents" className="btn-primary px-4 py-2 text-sm">
                  <Plus size={16} />
                  Загрузить документы
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, i) => (
            <div key={i} className="app-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.label}</span>
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon size={16} className={stat.color} />
                </div>
              </div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">{stat.value}</div>
              {stat.hint && <p className="text-xs text-slate-400 mt-1">{stat.hint}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900">Подходящие медтендеры</h2>
              <Link href="/tenders" className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                Все {medicalTenderCount} <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              {tendersWithScores.length === 0 ? (
                <div className="app-card p-8 text-center text-slate-500 text-sm">
                  {feedPage.cacheBuilding
                    ? "Строим список подходящих закупок…"
                    : "Нет тендеров — нажмите «Загрузить с zakupki.gov.ru» справа"}
                </div>
              ) : (
                tendersWithScores.map(({ tender, score }) => {
                  const days = daysUntil(tender.deadline);
                  const scoreStatus = score !== null ? (score >= 75 ? "green" : score >= 50 ? "yellow" : "red") : null;
                  return (
                    <Link
                      key={tender.id}
                      href={`/tenders/${tender.id}`}
                      className="block app-card p-4 card-hover"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-400 mb-1">
                            {tender.region} · № {tender.externalId}
                          </p>
                          <h3 className="text-sm font-medium text-slate-900 leading-snug line-clamp-2 mb-1">
                            {tender.title}
                          </h3>
                          <p className="text-xs text-slate-500 truncate">{tender.customerName}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div className="text-sm font-semibold text-slate-900">{formatPrice(tender.price)}</div>
                          {score !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${scoreStatus === "green" ? "score-green" : scoreStatus === "yellow" ? "score-yellow" : "score-red"}`}
                            >
                              {Math.round(score)}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          <p className={`text-xs ${days <= 3 ? "text-red-600 font-medium" : days <= 7 ? "text-amber-600" : "text-slate-400"}`}>
                            {days > 0 ? `${days} дн.` : "истёк"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="app-card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Быстрые действия</h3>
              <div className="space-y-1">
                {[
                  { href: "/documents", icon: FileText, label: "Загрузить документ", bg: "bg-blue-50", color: "text-blue-600" },
                  { href: "/tenders", icon: Search, label: "Все тендеры", bg: "bg-emerald-50", color: "text-emerald-600" },
                  { href: "/growth", icon: TrendingUp, label: "Карта роста", bg: "bg-violet-50", color: "text-violet-600" },
                ].map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700"
                  >
                    <div className={`w-8 h-8 rounded-lg ${action.bg} flex items-center justify-center`}>
                      <action.icon size={15} className={action.color} />
                    </div>
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="app-card p-5 border border-emerald-100 bg-emerald-50/40">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Синхронизация с ЕИС</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Одна кнопка: поиск, карточки ЕИС и разбор ТЗ у лучших закупок по вашему профилю и РУ
              </p>
              <TendersSyncButton />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REAL_EIS_TENDER_WHERE } from "@/lib/tenderQuery";
import { getAccessStatus } from "@/lib/subscription";
import Sidebar from "@/components/Sidebar";
import { TrendingUp, Lock, CheckCircle, ArrowRight } from "lucide-react";

export default async function GrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const totalTenders = await prisma.tender.count({ where: REAL_EIS_TENDER_WHERE });

  const documents = user.company
    ? await prisma.document.findMany({ where: { companyId: user.company.id } })
    : [];

  const hasDocType = (t: string) => documents.some((d) => d.type === t && (() => {
    try { return JSON.parse(d.extractedData || "{}").isRelevant === true; } catch { return false; }
  })());

  const GROWTH_ITEMS = [
    {
      license: "Лицензия МЧС",
      desc: "Монтаж пожарной сигнализации и систем оповещения",
      cost: "от 80 000 ₽",
      time: "6-8 недель",
      docType: "license_mchs",
      priority: "high" as const,
    },
    {
      license: "Лицензия ФСТЭК",
      desc: "Техническая защита конфиденциальной информации",
      cost: "от 120 000 ₽",
      time: "3-4 месяца",
      docType: "license_fstec",
      priority: "high" as const,
    },
    {
      license: "Сертификат на продукцию",
      desc: "Подтверждение характеристик товара по ТЗ тендера",
      cost: "от 15 000 ₽",
      time: "2-3 недели",
      docType: "certificate",
      priority: "medium" as const,
    },
    {
      license: "Лицензия ФСБ",
      desc: "Деятельность по защите информации",
      cost: "Уже есть / от 200 000 ₽",
      time: "3-6 месяцев",
      docType: "license_fsb",
      priority: "done" as const,
    },
  ].map((item) => {
    const hasIt = hasDocType(item.docType);
    return {
      ...item,
      hasIt,
      tenders: hasIt ? 0 : Math.round(totalTenders * (item.docType === "license_mchs" ? 0.08 : item.docType === "license_fstec" ? 0.06 : item.docType === "certificate" ? 0.15 : 0.12)),
    };
  });

  const availableNow = Math.round(totalTenders * 0.3);
  const potentialExtra = GROWTH_ITEMS.filter((i) => !i.hasIt).reduce((s, i) => s + i.tenders, 0);

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Карта роста компании</h1>
          <p className="text-slate-600">Какие документы получить чтобы открыть доступ к большему числу тендеров</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 border border-slate-200 app-card">
            <p className="text-xs text-slate-500 mb-1">Доступно с вашими документами</p>
            <p className="text-2xl font-bold text-slate-900">~{availableNow}</p>
            <p className="text-xs text-slate-500 mt-1">из {totalTenders} в базе</p>
          </div>
          <div className="rounded-2xl p-5 border border-emerald-500/30" style={{ background: "rgba(16,185,129,0.05)" }}>
            <p className="text-xs text-slate-500 mb-1">Откроется при новых лицензиях</p>
            <p className="text-2xl font-bold text-emerald-600">+{potentialExtra}</p>
            <p className="text-xs text-slate-600 mt-1">оценка по категориям</p>
          </div>
          <div className="rounded-2xl p-5 border border-blue-500/30" style={{ background: "rgba(59,130,246,0.05)" }}>
            <p className="text-xs text-slate-500 mb-1">Всего в базе</p>
            <p className="text-2xl font-bold text-blue-600">{totalTenders}</p>
            <p className="text-xs text-slate-600 mt-1">тендеров zakupki.gov.ru</p>
          </div>
        </div>

        <div className="space-y-4">
          {GROWTH_ITEMS.map((item, i) => (
            <div key={i} className={`rounded-2xl border p-6 ${item.hasIt ? "border-emerald-500/20" : item.priority === "high" ? "border-blue-500/20" : "border-slate-200"}`} style={{ background: item.hasIt ? "rgba(16,185,129,0.05)" : "var(--app-surface)" }}>
              <div className="flex items-start gap-5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${item.hasIt ? "bg-emerald-500/20" : "bg-blue-500/10"}`}>
                  {item.hasIt ? <CheckCircle size={22} className="text-emerald-600" /> : <Lock size={22} className="text-blue-600" />}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className={`font-semibold ${item.hasIt ? "text-emerald-700" : "text-slate-900"}`}>{item.license}</h3>
                    {item.hasIt && <span className="text-xs px-2 py-0.5 rounded-full score-green">Уже есть</span>}
                    {!item.hasIt && item.priority === "high" && <span className="text-xs px-2 py-0.5 rounded-full score-yellow">Рекомендуется</span>}
                  </div>
                  <p className="text-sm text-slate-600 mb-4">{item.desc}</p>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Тендеров откроется</p>
                      <p className="text-sm font-bold text-slate-900">{item.hasIt ? "—" : `+${item.tenders}`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">В базе сейчас</p>
                      <p className="text-sm font-bold text-slate-900">{totalTenders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Стоимость</p>
                      <p className="text-sm font-bold text-slate-900">{item.cost}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Срок получения</p>
                      <p className="text-sm font-bold text-slate-900">{item.time}</p>
                    </div>
                  </div>
                </div>

                {!item.hasIt && (
                  <a href="/documents" className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 btn-primary">
                    Загрузить <ArrowRight size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

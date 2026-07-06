import Link from "next/link";
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  TrendingUp,
  Package,
  FileText,
  ArrowRight,
} from "lucide-react";
import type { CatalogRuSource } from "@/lib/matching";
import type { ProcurementBundle } from "@/lib/tzProcurementBundles";
import type {
  NomenclatureMatchRow,
  ParticipationForecast,
  ProcurementItem,
  ProcurementKind,
} from "@/lib/tenderPresentation";
import ProcurementBundlesView from "@/components/tender/ProcurementBundlesView";
import AnalyzeTzButton from "@/components/tender/AnalyzeTzButton";

interface AnalysisSummary {
  score: number;
  recommendation: string;
  blockers: string[];
  warnings: string[];
  missingDocs: string[];
}

interface Props {
  forecast: ParticipationForecast;
  procurementItems: ProcurementItem[];
  nomenclatureRows: NomenclatureMatchRow[];
  characteristicRows: NomenclatureMatchRow[];
  catalogRuSources: CatalogRuSource[];
  excludedRuCount: number;
  analysis: AnalysisSummary | null;
  hasCatalog: boolean;
  catalogProductCount?: number;
  aiLabel: string;
  procurementKind?: ProcurementKind;
  tenderTitle?: string;
  tzEnrichmentPending?: boolean;
  tzParsedFromFile?: boolean;
  procurementBundles?: ProcurementBundle[];
  tenderId?: string;
  procurementVolumeSummary?: string | null;
}

function StatusBadge({ status }: { status: "match" | "partial" | "missing" }) {
  if (status === "match") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full">
        <CheckCircle size={12} /> Есть в РУ
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 rounded-full">
        <AlertCircle size={12} /> Проверить
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 dark:bg-red-500/15 px-2 py-0.5 rounded-full">
      <XCircle size={12} /> Нет в РУ
    </span>
  );
}

function forecastColors(level: ParticipationForecast["level"]) {
  switch (level) {
    case "high":
      return { ring: "border-emerald-500/30", bg: "from-emerald-50 to-white dark:from-emerald-950/30", text: "text-emerald-700" };
    case "medium":
      return { ring: "border-amber-500/30", bg: "from-amber-50 to-white dark:from-amber-950/30", text: "text-amber-800" };
    case "low":
      return { ring: "border-orange-500/30", bg: "from-orange-50 to-white", text: "text-orange-800" };
    default:
      return { ring: "border-red-500/30", bg: "from-red-50 to-white dark:from-red-950/20", text: "text-red-700" };
  }
}

export default function TenderAnalysisView({
  forecast,
  procurementItems,
  nomenclatureRows,
  characteristicRows,
  catalogRuSources,
  excludedRuCount,
  analysis,
  hasCatalog,
  aiLabel,
  procurementKind = "unknown",
  tenderTitle = "",
  tzEnrichmentPending = false,
  tzParsedFromFile = false,
  procurementBundles = [],
  catalogProductCount = 0,
  tenderId,
  procurementVolumeSummary = null,
}: Props) {
  const fc = forecastColors(forecast.level);
  const isServiceOrWorks = procurementKind === "service" || procurementKind === "works";
  const displayPercent =
    forecast.coveragePercent !== undefined && forecast.totalItems > 0
      ? forecast.coveragePercent
      : forecast.level === "none"
        ? Math.min(forecast.chancePercent, 18)
        : forecast.chancePercent;
  const percentLabel =
    forecast.totalItems > 0 ? "покрытие ТЗ в РУ" : "оценка шансов";

  return (
    <div className="space-y-5">
      {/* Прогноз — главная фишка */}
      <section id="forecast" className={`rounded-2xl border ${fc.ring} bg-gradient-to-br ${fc.bg} p-6 app-card`}>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={18} className={fc.text} />
              <h2 className="font-semibold text-slate-900">Прогноз участия</h2>
            </div>
            <p className="text-xs text-slate-500">{aiLabel}</p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold tabular-nums ${fc.text}`}>
              {forecast.preliminary ? "≈" : ""}
              {displayPercent}%
            </div>
            <p className="text-xs text-slate-500">
              {forecast.preliminary ? "предварительно · " : ""}
              {percentLabel}
            </p>
            {forecast.totalItems > 0 && forecast.chancePercent !== displayPercent && (
              <p className="text-[10px] text-slate-400 mt-0.5">шанс участия ~{forecast.chancePercent}%</p>
            )}
          </div>
        </div>
        <p className={`text-base font-medium text-slate-900 mb-1`}>{forecast.headline}</p>
        {forecast.preliminary && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            Оценка по извещению ЕИС. После разбора файла ТЗ процент может сильно измениться.
          </p>
        )}
        {tzParsedFromFile && forecast.totalItems > 0 && forecast.coveragePercent === 0 && (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-2">
            Прогноз пересчитан по файлу ТЗ: позиции закупки не совпали с вашим РУ.
          </p>
        )}
        {procurementVolumeSummary ? (
          <p className="text-sm font-semibold text-blue-800 bg-blue-50/80 border border-blue-100 rounded-lg px-3 py-2 mb-2">
            {procurementVolumeSummary}
          </p>
        ) : forecast.totalItems > 0 ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 mb-2">
            Объём поставки не указан — для расчёта экономики откройте карточку или разберите ТЗ.
          </p>
        ) : null}
        {forecast.totalItems > 0 && (
          <p className="text-xs font-medium text-slate-600 mb-1">
            В ТЗ {forecast.totalItems} позиций · в вашем РУ {catalogProductCount > 0 ? `${catalogProductCount} изделий` : "—"}
          </p>
        )}
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{forecast.detail}</p>
        {forecast.totalItems > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/80 dark:bg-slate-800/50 border border-slate-200/80 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-emerald-600">{forecast.matchedItems}</p>
              <p className="text-[11px] text-slate-500">из {forecast.totalItems} в ТЗ</p>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-slate-800/50 border border-slate-200/80 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-amber-700">{forecast.partialItems}</p>
              <p className="text-[11px] text-slate-500">уточнить</p>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-slate-800/50 border border-slate-200/80 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-red-600">{forecast.missingItems}</p>
              <p className="text-[11px] text-slate-500">нет в РУ</p>
            </div>
          </div>
        )}
        {analysis?.recommendation && (
          <p className="mt-4 text-sm text-slate-700 border-t border-slate-200/80 pt-3">{analysis.recommendation}</p>
        )}
        {tzEnrichmentPending && tenderId && !isServiceOrWorks && (
          <div className="mt-4 pt-4 border-t border-slate-200/80">
            <AnalyzeTzButton tenderId={tenderId} showWhenPending />
          </div>
        )}
      </section>

      {/* Наборы и позиции ТЗ */}
      <section id="objects" className="rounded-2xl border border-slate-200 app-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900 text-sm">
              {isServiceOrWorks ? "Предмет закупки" : "Наборы и позиции ТЗ"}
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isServiceOrWorks
              ? "Закупка не на поставку медизделий"
              : "Изделия и признаки (характеристики) — как в описании объекта закупки"}
          </p>
        </div>
        {isServiceOrWorks && tenderTitle ? (
          <div className="px-4 py-5">
            <p className="text-sm text-slate-800 leading-relaxed">{tenderTitle}</p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 mt-3">
              Услуги или работы — сверка с РУ не применяется.
            </p>
          </div>
        ) : procurementBundles.length > 0 ? (
          <ProcurementBundlesView
            bundles={procurementBundles}
            tenderId={tenderId}
            tzParsedFromFile={tzParsedFromFile}
            tzEnrichmentPending={tzEnrichmentPending}
            procurementVolumeSummary={procurementVolumeSummary}
          />
        ) : procurementItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium w-10">№</th>
                  <th className="px-3 py-2 font-medium">Наименование</th>
                  <th className="px-4 py-2 font-medium w-28">В РУ</th>
                </tr>
              </thead>
              <tbody>
                {nomenclatureRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-400 tabular-nums text-xs">{i + 1}</td>
                    <td className="px-3 py-2 text-slate-800 text-sm">{row.requested}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ProcurementBundlesView
            bundles={[]}
            tenderId={tenderId}
            tzParsedFromFile={tzParsedFromFile}
            tzEnrichmentPending={tzEnrichmentPending}
            procurementVolumeSummary={procurementVolumeSummary}
          />
        )}
      </section>

      {/* Сверка с каталогом РУ */}
      {hasCatalog && nomenclatureRows.length > 0 && !isServiceOrWorks && (
        <section id="match" className="rounded-2xl border border-slate-200 app-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Что есть у вас из того, что им нужно</h2>
            <p className="text-xs text-slate-500 mt-1">
              {catalogRuSources.length > 0
                ? `РУ: ${catalogRuSources.map((r) => r.number).join(", ")}`
                : "Сверка по каталогу из приложения к РУ"}
              {catalogProductCount > 0 && (
                <> · в каталоге {catalogProductCount} позиций (с размерами из приложения)</>
              )}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50/50">
                  <th className="px-5 py-3 font-medium">Запрос заказчика</th>
                  <th className="px-3 py-3 font-medium">Позиция в вашем РУ</th>
                  <th className="px-5 py-3 font-medium w-28">Статус</th>
                </tr>
              </thead>
              <tbody>
                {nomenclatureRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 text-slate-800 align-top max-w-xs">{row.requested}</td>
                    <td className="px-3 py-3 text-slate-600 align-top text-xs leading-relaxed">
                      {row.matchedProduct ? (
                        <span className="text-emerald-800 dark:text-emerald-300">{row.matchedProduct}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {row.note && row.matchedProduct && (
                        <p className="text-[10px] text-slate-500 mt-1">{row.note}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {excludedRuCount > 0 && (
            <p className="px-5 py-3 text-xs text-amber-800 bg-amber-50/80 border-t border-amber-200/50">
              {excludedRuCount === 1
                ? "1 другое РУ не относится к этой закупке и не участвует в сверке"
                : `${excludedRuCount} других РУ не относятся к этой закупке`}
            </p>
          )}
        </section>
      )}

      {/* Характеристики — только если нет группировки в наборах */}
      {characteristicRows.length > 0 && procurementBundles.length === 0 && (
        <section className="rounded-2xl border border-slate-200 app-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">Требования к характеристикам</h2>
            <p className="text-xs text-slate-500 mt-0.5">Из файла ТЗ — сверка с каталогом РУ</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {characteristicRows.slice(0, 15).map((row, i) => (
              <div key={i} className="px-5 py-2.5 flex items-start justify-between gap-3">
                <p className="text-xs text-slate-700 flex-1">{row.requested}</p>
                <StatusBadge status={row.status} />
              </div>
            ))}
            {characteristicRows.length > 15 && (
              <p className="px-5 py-2 text-xs text-slate-500">…ещё {characteristicRows.length - 15} характеристик</p>
            )}
          </div>
        </section>
      )}

      {/* Документы и блокеры — компактно */}
      {analysis && (analysis.blockers.length > 0 || analysis.missingDocs.length > 0) && (
        <section className="rounded-2xl border border-slate-200 app-card p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            Что доработать перед подачей
          </h3>
          <ul className="space-y-2">
            {analysis.blockers.map((b, i) => (
              <li key={`b-${i}`} className="text-sm text-red-700 flex gap-2">
                <XCircle size={14} className="shrink-0 mt-0.5" /> {b}
              </li>
            ))}
            {analysis.missingDocs.map((d, i) => (
              <li key={`d-${i}`} className="text-sm text-slate-700 flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-2" /> {d}
              </li>
            ))}
          </ul>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-3"
          >
            Загрузить документы <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {!hasCatalog && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center app-card">
          <p className="text-sm text-slate-600 mb-3">Загрузите РУ с приложением — покажем, какие позиции закупки вы можете закрыть</p>
          <Link href="/documents" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white btn-primary">
            <FileText size={16} /> Загрузить РУ
          </Link>
        </div>
      )}
    </div>
  );
}

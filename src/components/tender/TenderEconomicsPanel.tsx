import { Calculator, TrendingUp, AlertCircle } from "lucide-react";
import type { TenderEconomicsResult } from "@/lib/tenderEconomics";

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function marginClass(percent: number | null) {
  if (percent == null) return "bg-slate-50 border-slate-200 text-slate-700";
  return percent >= 15
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : "bg-amber-50 border-amber-200 text-amber-800";
}

export default function TenderEconomicsPanel({ economics }: { economics: TenderEconomicsResult }) {
  if (!economics.hasPrices) {
    return (
      <section id="economics" className="rounded-xl border border-slate-200 p-5 app-card">
        <h2 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <Calculator size={16} />
          Экономика участия
        </h2>
        <p className="text-xs text-slate-500">
          Загрузите нет-прайс поставщика в разделе «Документы» — посчитаем себестоимость и маржу к НМЦК.
        </p>
      </section>
    );
  }

  const showMulti = economics.multiPricelist && economics.pricelistSummaries.length >= 2;

  return (
    <section id="economics" className="rounded-xl border border-slate-200 p-5 app-card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Calculator size={16} />
            Экономика участия
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {showMulti
              ? `Сравнение по ${economics.pricelistSummaries.length} прайсам · ${economics.coveredLines} из ${economics.totalLines} позиций`
              : `Себестоимость по вашим нет-прайсам · ${economics.coveredLines} из ${economics.totalLines} позиций`}
          </p>
        </div>
        {!showMulti && economics.marginPercent != null && economics.marginRub != null && (
          <div className={`text-right px-3 py-2 rounded-lg border ${marginClass(economics.marginPercent)}`}>
            <div className="text-lg font-bold flex items-center justify-end gap-1">
              <TrendingUp size={16} />
              {economics.marginPercent}%
            </div>
            <div className="text-xs">маржа {formatRub(economics.marginRub)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
          <div className="text-xs text-slate-500">НМЦК</div>
          <div className="font-semibold text-slate-900">{formatRub(economics.nmck)}</div>
        </div>
        {!showMulti ? (
          <>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <div className="text-xs text-slate-500">Себестоимость (оценка)</div>
              <div className="font-semibold text-slate-900">{formatRub(economics.costTotal)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 col-span-2 sm:col-span-1">
              <div className="text-xs text-slate-500">Покрыто прайсом</div>
              <div className="font-semibold text-slate-900">
                {economics.coveredLines}/{economics.totalLines}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 col-span-2 sm:col-span-2">
            <div className="text-xs text-slate-500 mb-1">Лучшая маржа среди прайсов</div>
            <div className="font-semibold text-slate-900">
              {economics.marginPercent != null ? `${economics.marginPercent}%` : "—"}
              {economics.marginRub != null ? ` · ${formatRub(economics.marginRub)}` : ""}
            </div>
          </div>
        )}
      </div>

      {showMulti && (
        <div className="grid gap-3 mb-4 sm:grid-cols-2">
          {economics.pricelistSummaries.map((summary) => (
            <div
              key={summary.documentId}
              className={`rounded-lg border p-3 text-sm ${marginClass(summary.marginPercent)}`}
            >
              <div className="text-xs font-medium mb-2 line-clamp-2" title={summary.label}>
                {summary.label}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="opacity-70">Себестоимость</div>
                  <div className="font-semibold">{formatRub(summary.costTotal)}</div>
                </div>
                <div>
                  <div className="opacity-70">Маржа</div>
                  <div className="font-semibold">
                    {summary.marginPercent != null ? `${summary.marginPercent}%` : "—"}
                    {summary.marginRub != null ? ` · ${formatRub(summary.marginRub)}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-[10px] mt-2 opacity-70">
                Покрыто {summary.coveredLines}/{economics.totalLines} позиций
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-2 font-medium">Позиция ТЗ</th>
              <th className="py-2 pr-2 font-medium">Кол-во</th>
              {showMulti ? (
                economics.pricelistSummaries.map((pl) => (
                  <th key={pl.documentId} className="py-2 pr-2 font-medium min-w-[140px]">
                    <div className="line-clamp-2" title={pl.label}>
                      {pl.label}
                    </div>
                  </th>
                ))
              ) : (
                <>
                  <th className="py-2 pr-2 font-medium">Цена закупки</th>
                  <th className="py-2 font-medium">Сумма</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {economics.lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-50 align-top">
                <td className="py-2 pr-2 text-slate-800 max-w-[200px]">
                  <div>{line.tenderItemName}</div>
                  {!showMulti && line.matchedPriceName && (
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                      → {line.matchedPriceName}
                      {line.vendor ? ` · ${line.vendor}` : ""}
                    </div>
                  )}
                  {!showMulti && !line.matchedPriceName && (
                    <div className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle size={10} /> нет в прайсе
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2 text-slate-600 whitespace-nowrap">
                  {line.quantity.toLocaleString("ru-RU")} {line.unit}
                </td>
                {showMulti ? (
                  economics.pricelistSummaries.map((pl) => {
                    const match = line.pricelistMatches.find((m) => m.documentId === pl.documentId);
                    return (
                      <td key={pl.documentId} className="py-2 pr-2 align-top">
                        {match?.unitPrice != null ? (
                          <div>
                            <div className="font-medium text-slate-900 whitespace-nowrap">
                              {match.unitPrice.toFixed(2)} ₽
                            </div>
                            <div className="text-slate-600 whitespace-nowrap">
                              {match.lineCost != null ? formatRub(match.lineCost) : "—"}
                            </div>
                            {match.matchedPriceName && (
                              <div className="text-[10px] text-slate-400 mt-1 line-clamp-2" title={match.matchedPriceName}>
                                → {match.matchedPriceName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-amber-600 flex items-center gap-1">
                            <AlertCircle size={10} /> нет
                          </div>
                        )}
                      </td>
                    );
                  })
                ) : (
                  <>
                    <td className="py-2 pr-2 text-slate-700 whitespace-nowrap">
                      {line.unitPrice != null ? `${line.unitPrice.toFixed(2)} ₽` : "—"}
                    </td>
                    <td className="py-2 font-medium text-slate-900 whitespace-nowrap">
                      {line.lineCost != null ? formatRub(line.lineCost) : "—"}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

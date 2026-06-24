import {
  CheckCircle,
  AlertCircle,
  XCircle,
  Layers,
  Info,
} from "lucide-react";
import type { ProcurementBundle } from "@/lib/tzProcurementBundles";
import AnalyzeTzButton from "@/components/tender/AnalyzeTzButton";

function StatusBadge({ status }: { status: "match" | "partial" | "missing" }) {
  if (status === "match") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
        <CheckCircle size={10} /> В РУ
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
        <AlertCircle size={10} /> Проверить
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
      <XCircle size={10} /> Нет
    </span>
  );
}

interface Props {
  bundles: ProcurementBundle[];
  tenderId?: string;
  tzParsedFromFile?: boolean;
  tzEnrichmentPending?: boolean;
  procurementVolumeSummary?: string | null;
}

export default function ProcurementBundlesView({
  bundles,
  tenderId,
  tzParsedFromFile = false,
  tzEnrichmentPending = false,
  procurementVolumeSummary = null,
}: Props) {
  const needsTzAnalyze = tzEnrichmentPending || !tzParsedFromFile;
  const missingVolume = bundles.length > 0 && !bundles.some((b) => b.quantityText);

  if (bundles.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-slate-500">
        {needsTzAnalyze ? (
          <>
            <p className="text-slate-700 font-medium mb-1">ТЗ ещё не разобрано</p>
            <p className="text-xs mb-3 max-w-md mx-auto">
              Скачаем «Описание объекта закупки» и ТЗ с zakupki.gov.ru и извлечём позиции и характеристики.
            </p>
            {tenderId && <AnalyzeTzButton tenderId={tenderId} showWhenPending />}
          </>
        ) : (
          <p className="text-xs">Позиции из ТЗ не извлечены.</p>
        )}
      </div>
    );
  }
  const hasKitHints = bundles.some((b) => b.kitFromRuHint);

  return (
    <div className="divide-y divide-slate-100">
      {needsTzAnalyze && tenderId && (
        <div className="px-4 py-3 bg-blue-50/80 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[11px] text-blue-900 text-left">
            {tzEnrichmentPending
              ? "Данные только из извещения — для точного прогноза разберите файлы ТЗ."
              : "ТЗ из HTML извещения — для полного разбора нажмите кнопку."}
          </p>
          <AnalyzeTzButton tenderId={tenderId} showWhenPending compact />
        </div>
      )}
      {!tzParsedFromFile && hasKitHints && (
        <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-100 flex gap-2 text-[11px] text-amber-900">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p>
            Файл ТЗ не разобран — для комплектов показан типовой состав из вашего РУ. После синхронизации с
            разбором DOCX появятся точные признаки заказчика.
          </p>
        </div>
      )}
      {procurementVolumeSummary && (
        <div className="px-4 py-2.5 bg-blue-50/90 border-b border-blue-100 text-[11px] font-semibold text-blue-900">
          {procurementVolumeSummary}
        </div>
      )}
      {missingVolume && !procurementVolumeSummary && (
        <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-100 text-[11px] text-amber-900">
          Объём поставки не найден в ТЗ — уточните количество в документах заказчика для расчёта экономики.
        </div>
      )}

      {bundles.map((bundle) => (
        <div key={bundle.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="text-[10px] text-slate-400 tabular-nums">#{bundle.position}</span>
                {bundle.isKit && (
                  <span className="text-[10px] px-1.5 py-px rounded bg-violet-50 text-violet-700 border border-violet-200">
                    <Layers size={9} className="inline mr-0.5 -mt-px" />
                    Набор
                  </span>
                )}
                {bundle.ktruCode && (
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]">
                    {bundle.ktruCode}
                  </span>
                )}
                {bundle.kitFromRuHint && (
                  <span className="text-[10px] text-amber-700">состав по РУ</span>
                )}
              </div>
              <h3 className="text-sm font-medium text-slate-900 leading-snug">{bundle.name}</h3>
              {bundle.quantityText && (
                <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                  Объём: {bundle.quantityText}
                </p>
              )}
              {bundle.match.matchedProduct && bundle.match.status !== "missing" && (
                <p className="text-[11px] text-emerald-700 mt-0.5 truncate">{bundle.match.matchedProduct}</p>
              )}
            </div>
            <StatusBadge status={bundle.match.status} />
          </div>

          {bundle.characteristics.length > 0 && (
            <div className="mt-2 ml-3 border-l-2 border-slate-100 pl-3 space-y-1.5">
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                {bundle.kitFromRuHint ? "Состав / позиции" : "Признаки и характеристики"}
              </p>
              {bundle.characteristics.map((ch) => (
                <div key={ch.id} className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-slate-700 leading-snug flex-1 min-w-0">
                    {ch.field ? (
                      <>
                        <span className="text-slate-500">{ch.field}:</span> {ch.value || ch.label}
                      </>
                    ) : (
                      ch.label
                    )}
                  </p>
                  <StatusBadge status={ch.match.status} />
                </div>
              ))}
            </div>
          )}

          {bundle.isKit && bundle.characteristics.length === 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5 ml-3">
              Состав набора не указан в ТЗ — загрузите «Описание объекта закупки» через синхронизацию.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

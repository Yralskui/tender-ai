"use client";

import { Globe2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import {
  analyzeNationalRegime,
  readStoredNationalRegime,
  type NationalRegimeAnalysis,
} from "@/lib/nationalRegime";

export interface NationalRegimePanelProps {
  requirements: Record<string, unknown>;
  nmck: number;
}

function statusTone(analysis: NationalRegimeAnalysis): "green" | "amber" | "red" | "slate" {
  if (analysis.foreignParticipation === "banned") return "red";
  if (analysis.foreignParticipation === "restricted") return "amber";
  if (analysis.exemptionPossible) return "green";
  if (analysis.appliedMeasures.includes("preference")) return "amber";
  return "slate";
}

const toneClasses = {
  green: "border-emerald-200 bg-emerald-50/60",
  amber: "border-amber-200 bg-amber-50/50",
  red: "border-red-200 bg-red-50/50",
  slate: "border-slate-200 bg-slate-50/50",
} as const;

export default function NationalRegimePanel({ requirements, nmck }: NationalRegimePanelProps) {
  const stored = readStoredNationalRegime(requirements);
  const productSpecs = Array.isArray(requirements.productSpecs)
    ? (requirements.productSpecs as string[])
    : [];
  const tzVolumes = Array.isArray(requirements.tzVolumes)
    ? (requirements.tzVolumes as Array<{ quantity: number; name?: string }>)
    : undefined;

  const analysis = analyzeNationalRegime(stored, nmck, productSpecs, tzVolumes);
  const tone = statusTone(analysis);

  return (
    <section id="national-regime" className={`rounded-2xl border p-5 app-card ${toneClasses[tone]}`}>
      <div className="flex items-start gap-3 mb-3">
        <Globe2 size={18} className="text-slate-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm">Иностранное происхождение и нацрежим</h3>
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">{analysis.summary}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 mb-3 text-xs">
        <div className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2">
          <p className="text-slate-500 mb-0.5">Участие с импортом</p>
          <p className="font-medium text-slate-900">
            {analysis.foreignParticipation === "banned"
              ? "Как правило, нет"
              : analysis.foreignParticipation === "restricted"
                ? "Ограничено"
                : analysis.foreignParticipation === "allowed"
                  ? "Допускается"
                  : "Уточните в извещении"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2">
          <p className="text-slate-500 mb-0.5">Льгота до 1 млн ₽ (п. 5(и) ПП № 1875)</p>
          <p className="font-medium text-slate-900 flex items-center gap-1">
            {analysis.exemptionPossible ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-600" />
                Возможна по сумме
              </>
            ) : analysis.nmckUnder1M ? (
              <>
                <Info size={13} className="text-slate-500" />
                НМЦК подходит, но в извещении уже иная мера
              </>
            ) : (
              <>
                <AlertTriangle size={13} className="text-amber-600" />
                Не подходит (НМЦК &gt; 1 млн)
              </>
            )}
          </p>
        </div>
      </div>

      {analysis.details.length > 0 && (
        <ul className="text-xs text-slate-700 space-y-1.5 mb-3 list-disc list-inside">
          {analysis.details.map((line, i) => (
            <li key={`${i}-${line.slice(0, 40)}`}>{line}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-600 leading-relaxed border-t border-slate-200/70 pt-3">
        {analysis.legalNote}
      </p>
    </section>
  );
}

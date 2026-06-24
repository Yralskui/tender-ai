"use client";

import Link from "next/link";
import { CheckCircle, AlertCircle, XCircle, Clock, FileText, Package } from "lucide-react";
import { saveTenderFeedScroll } from "@/components/tender/TenderFeedNav";

function formatPrice(price: number) {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)} млн ₽`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(0)} тыс ₽`;
  return `${price} ₽`;
}

function daysUntil(date: Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export interface TenderFeedCardProps {
  id: string;
  externalId: string;
  title: string;
  customerName: string;
  region: string;
  category: string;
  price: number;
  deadline: Date;
  displayScore: number | null;
  hasCatalog?: boolean;
  ruMatched?: number;
  ruPartial?: number;
  ruTotal?: number;
  isEis?: boolean;
  hasTzFile?: boolean;
  returnView?: string;
  returnHref: string;
  labelNames?: string[];
  labelColors?: string[];
}

export default function TenderFeedCard({
  id,
  externalId,
  title,
  customerName,
  region,
  category,
  price,
  deadline,
  displayScore,
  hasCatalog = false,
  ruMatched = 0,
  ruPartial = 0,
  ruTotal = 0,
  isEis = false,
  hasTzFile = false,
  returnView = "matched",
  returnHref,
  labelNames = [],
  labelColors = [],
}: TenderFeedCardProps) {
  const days = daysUntil(deadline);
  const scoreStatus =
    displayScore !== null
      ? displayScore >= 65
        ? "green"
        : displayScore >= 40
          ? "yellow"
          : "red"
      : null;

  const tenderHref = `/tenders/${id}?returnTo=${encodeURIComponent(returnHref)}&from=${returnView}`;

  return (
    <Link
      href={tenderHref}
      onClick={() => saveTenderFeedScroll(returnHref)}
      className="block rounded-xl border border-slate-200 px-4 py-3.5 sm:px-5 sm:py-4 hover:border-slate-300 transition-all card-hover app-card"
    >
      <div className="flex items-start gap-4 sm:gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[11px] font-mono text-slate-500 tabular-nums" title="Номер закупки в ЕИС">
              № {externalId}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">{region}</span>
            <span className="text-xs px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 truncate max-w-[140px]">
              {category}
            </span>
            {isEis && (
              <span className="text-xs px-2 py-0.5 rounded-md border border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                ЕИС
              </span>
            )}
            {hasTzFile && (
              <span className="text-xs px-2 py-0.5 rounded-md border border-blue-500/30 text-blue-600 bg-blue-500/10">
                ТЗ
              </span>
            )}
            {labelNames.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="text-xs px-2 py-0.5 rounded-md text-white"
                style={{ backgroundColor: labelColors[i] || "#64748b" }}
              >
                {name}
              </span>
            ))}
            {hasCatalog && ruTotal > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-md border border-violet-500/30 text-violet-700 bg-violet-500/10">
                <Package size={11} className="inline mr-0.5 -mt-px" />
                {ruMatched + ruPartial}/{ruTotal}
              </span>
            )}
            {days <= 7 && days > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-md sm:hidden ${
                  days <= 3
                    ? "bg-red-500/10 border border-red-500/30 text-red-600"
                    : "bg-yellow-500/10 border border-yellow-500/30 text-amber-700"
                }`}
              >
                {days} дн.
              </span>
            )}
          </div>

          <h3 className="text-[15px] sm:text-base font-medium text-slate-900 leading-snug line-clamp-2 mb-1.5">
            {title}
          </h3>

          <p className="text-sm text-slate-600 truncate">{customerName}</p>
        </div>

        <div className="shrink-0 text-right flex flex-col items-end gap-1.5 min-w-[88px] sm:min-w-[104px]">
          <span className="text-base sm:text-lg font-semibold text-slate-900 tabular-nums leading-tight">
            {formatPrice(price)}
          </span>

          {displayScore !== null ? (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                scoreStatus === "green" ? "score-green" : scoreStatus === "yellow" ? "score-yellow" : "score-red"
              }`}
            >
              {scoreStatus === "green" ? (
                <CheckCircle size={12} />
              ) : scoreStatus === "yellow" ? (
                <AlertCircle size={12} />
              ) : (
                <XCircle size={12} />
              )}
              {displayScore}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md">
              <FileText size={11} /> —
            </span>
          )}

          <span
            className={`inline-flex items-center gap-1 text-xs ${
              days <= 3 ? "text-red-600 font-medium" : days <= 7 ? "text-amber-700" : "text-slate-500"
            }`}
          >
            <Clock size={12} />
            {days > 0 ? `${days} дн.` : "истёк"}
          </span>
        </div>
      </div>
    </Link>
  );
}

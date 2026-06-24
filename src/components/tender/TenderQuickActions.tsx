"use client";

import { Download } from "lucide-react";
import AnalyzeTzButton from "@/components/tender/AnalyzeTzButton";

interface Props {
  tenderId: string;
  documentCount: number;
  showAnalyze?: boolean;
}

export default function TenderQuickActions({
  tenderId,
  documentCount,
  showAnalyze = true,
}: Props) {
  const archiveHref = `/api/tenders/${tenderId}/documents/archive`;

  return (
    <div className="rounded-2xl border border-slate-200 p-4 app-card space-y-3">
      <h3 className="font-semibold text-slate-900 text-sm">Быстрые действия</h3>

      {showAnalyze && <AnalyzeTzButton tenderId={tenderId} showWhenPending compact />}

      {documentCount > 0 && (
        <a
          href={archiveHref}
          className="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <Download size={14} />
          Скачать все ({documentCount})
        </a>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { FileText, Download, ExternalLink } from "lucide-react";
import {
  classifyProcurementDocument,
  DOCUMENT_GROUP_LABELS,
} from "@/lib/procurementDocumentGroups";

export interface ProcurementDocumentItem {
  name: string;
  url?: string | null;
  format?: string;
  parsed?: boolean;
  specCount?: number;
  sizeBytes?: number;
}

interface Props {
  tenderId: string;
  documents: ProcurementDocumentItem[] | unknown[];
  fallbackDocuments?: unknown[];
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes <= 0) return "";
  return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`;
}

function normalizeDocumentItem(raw: unknown): ProcurementDocumentItem {
  if (typeof raw === "string") {
    const name = raw.trim();
    return { name: name || "Документ", parsed: false, specCount: 0, sizeBytes: 0 };
  }

  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name =
      typeof o.name === "string"
        ? o.name.trim()
        : typeof o.title === "string"
          ? o.title.trim()
          : typeof o.description === "string"
            ? o.description.trim()
            : "Документ";
    return {
      name: name || "Документ",
      url: typeof o.url === "string" ? o.url : null,
      format: typeof o.format === "string" ? o.format : undefined,
      parsed: Boolean(o.parsed),
      specCount: typeof o.specCount === "number" ? o.specCount : 0,
      sizeBytes: typeof o.sizeBytes === "number" ? o.sizeBytes : 0,
    };
  }

  return { name: "Документ", parsed: false, specCount: 0, sizeBytes: 0 };
}

export default function TenderDocumentsPanel({ tenderId, documents, fallbackDocuments = [] }: Props) {
  const items = useMemo(() => {
    const source = documents.length > 0 ? documents : fallbackDocuments;
    return source.map(normalizeDocumentItem).filter((d) => d.name.length > 0);
  }, [documents, fallbackDocuments]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProcurementDocumentItem[]>();
    for (const doc of items) {
      const group = DOCUMENT_GROUP_LABELS[classifyProcurementDocument(doc.name)];
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(doc);
    }
    return [...map.entries()];
  }, [items]);

  if (items.length === 0) {
    return <p className="text-xs text-slate-500">Синхронизируйте тендеры с ЕИС или нажмите «Разобрать ТЗ»</p>;
  }

  const archiveHref = `/api/tenders/${tenderId}/documents/archive`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">{items.length} файлов с zakupki.gov.ru</p>
        <a
          href={archiveHref}
          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <Download size={12} />
          Скачать всё
        </a>
      </div>

      {grouped.map(([groupLabel, docs]) => (
        <div key={groupLabel}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{groupLabel}</p>
          <div className="space-y-2">
            {docs.map((d, i) => {
              const name = d.name;
              const format = d.format || (name?.match(/\.(\w+)$/i)?.[1] || "").toLowerCase();
              const parsed = Boolean(d.parsed);
              const specCount = typeof d.specCount === "number" ? d.specCount : 0;
              const sizeLabel = formatSize(typeof d.sizeBytes === "number" ? d.sizeBytes : 0);
              const url = typeof d.url === "string" ? d.url : null;
              const downloadHref = `/api/tenders/${tenderId}/documents/download?name=${encodeURIComponent(name)}`;

              return (
                <div
                  key={`${name}-${i}`}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <FileText size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 break-words">{name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {parsed
                            ? `Разобрано: ${specCount} хар-к · ${String(format).toUpperCase()}${sizeLabel ? ` · ${sizeLabel}` : ""}`
                            : `${String(format).toUpperCase()}${sizeLabel ? ` · ${sizeLabel}` : ""}`}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <a
                        href={downloadHref}
                        className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                      >
                        Скачать
                      </a>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors inline-flex items-center gap-0.5"
                        >
                          ЕИС <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

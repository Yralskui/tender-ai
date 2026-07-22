"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, CheckCircle, Clock, AlertCircle, X, Trash2, Loader2, Info, ArrowRight, ChevronDown, ChevronUp, XCircle, ShieldAlert, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { DocRecommendation } from "@/lib/docRecommendations";

const ALL_DOC_TYPES = [
  { value: "license_fsb", label: "Лицензия ФСБ" },
  { value: "license_sro", label: "Допуск СРО" },
  { value: "license_mchs", label: "Лицензия МЧС" },
  { value: "license_fstec", label: "Лицензия ФСТЭК" },
  { value: "medical_ru", label: "РУ на медицинские изделия (Росздравнадзор)" },
  { value: "supplier_price", label: "Нет-прайс / коммерческое предложение поставщика" },
  { value: "certificate", label: "Сертификат на продукцию / декларация" },
  { value: "balance", label: "Бухгалтерский баланс" },
  { value: "egrul", label: "Выписка ЕГРЮЛ" },
  { value: "contracts", label: "Реестр контрактов ЕИС" },
  { value: "other", label: "Другой документ" },
];

interface ExtractedData {
  docType?: string;
  docTypeLabel?: string;
  issuedTo?: string;
  issuedBy?: string;
  number?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  summary?: string;
  detectedContent?: string;
  isRelevant?: boolean;
  warning?: string | null;
  aiProvider?: string;
  confidence?: number;
  products?: string[];
  productCount?: number;
  documentScope?: string;
  okpd2Code?: string | null;
}

interface Document {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  extractedData?: string | null;
}

interface Props {
  initialDocuments: Document[];
  recommendations: DocRecommendation[];
  hasProfile: boolean;
}

function parseExtracted(doc: Document): ExtractedData | null {
  if (!doc.extractedData) return null;
  try { return JSON.parse(doc.extractedData); } catch { return null; }
}

export default function DocumentsClient({ initialDocuments, recommendations, hasProfile }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [uploadWarningIsCritical, setUploadWarningIsCritical] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState("other");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setPendingFile(file);
    setSelectedType("other");
    setSelectedExpiry("");
    setUploadWarning("");
    setUploadError("");
    setShowModal(true);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  async function uploadFile() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError("");
    setUploadWarning("");
    try {
      const safeName = pendingFile.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || `document.${pendingFile.name.split(".").pop() || "pdf"}`;

      const fileForUpload =
        safeName === pendingFile.name
          ? pendingFile
          : new File([pendingFile], safeName, {
              type: pendingFile.type || "application/pdf",
              lastModified: pendingFile.lastModified,
            });

      const form = new FormData();
      form.append("file", fileForUpload);
      form.append("originalName", pendingFile.name);
      form.append("type", selectedType);
      if (selectedExpiry) form.append("expiresAt", selectedExpiry);

      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) { setUploadError(data.error || "Ошибка загрузки"); return; }

      // Обновляем список документов с актуальными данными из ответа
      setDocuments((prev) => [data.document, ...prev]);

      if (data.analysisPending && data.document?.id) {
        setExpandedDoc(data.document.id);
      }

      const critical = data.isRelevant === false;
      setUploadWarningIsCritical(critical);

      if (data.aiWarning) {
        setUploadWarning(data.aiWarning);
        if (data.isRelevant === true) {
          setShowModal(false);
          setPendingFile(null);
        }
      } else if (data.profileWarning) {
        setUploadWarning(data.profileWarning);
      } else {
        // Всё ок, закрываем
        setShowModal(false);
        setPendingFile(null);
      }
    } catch {
      setUploadError("Ошибка соединения");
    } finally {
      setUploading(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    setPendingFile(null);
    setUploadWarning("");
    setUploadError("");
  }

  async function deleteDocument(id: string) {
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {}
  }

  const typeInfo = (type: string) => {
    const found = recommendations.find((r) => r.value === type);
    if (found) return { label: found.label, color: found.color };
    const fallback = ALL_DOC_TYPES.find((t) => t.value === type);
    return { label: fallback?.label || type, color: "#94a3b8" };
  };

  const uploaded = documents
    .filter((d) => {
      const ex = parseExtracted(d);
      return ex?.isRelevant === true;
    })
    .flatMap((d) => {
      const ex = parseExtracted(d);
      return [d.type, ex?.docType].filter(Boolean) as string[];
    });
  const missing = recommendations.filter((r) => r.priority === "required" && !uploaded.includes(r.value));
  const irrelevantCount = documents.filter((d) => {
    const ex = parseExtracted(d);
    return ex?.isRelevant !== true;
  }).length;
  const needsReanalyze = documents.some((d) => {
    const ex = parseExtracted(d);
    return !ex || ex.isRelevant === undefined;
  });

  const pendingDocIds = documents.filter((d) => d.status === "pending").map((d) => d.id);
  const pendingPollKey = pendingDocIds.join(",");

  useEffect(() => {
    if (!pendingPollKey) return;

    const interval = setInterval(async () => {
      for (const id of pendingPollKey.split(",")) {
        try {
          const res = await fetch(`/api/documents/${id}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.document) {
            setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...data.document } : d)));
          }
        } catch {
          /* ignore */
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [pendingPollKey]);

  async function reanalyzeOne(id: string) {
    setReanalyzingId(id);
    try {
      const res = await fetch(`/api/documents/${id}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.document) {
        setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...data.document } : d)));
      } else {
        alert(data.error || "Ошибка перепроверки");
      }
    } catch {
      alert("Ошибка соединения");
    } finally {
      setReanalyzingId(null);
    }
  }

  async function reanalyzeAll() {
    setReanalyzing(true);
    try {
      const res = await fetch("/api/documents/reanalyze", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        window.location.reload();
      } else {
        alert(data.error || "Ошибка перепроверки");
      }
    } catch {
      alert("Ошибка соединения");
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <main className="flex-1 p-8 allow-text-select">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Мои документы</h1>
          <p className="text-slate-600">Загрузите документы — AI прочитает содержимое и проверит соответствие тендерам</p>
        </div>
        {(documents.length > 0 || needsReanalyze) && (
          <button
            onClick={reanalyzeAll}
            disabled={reanalyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-700 hover:text-slate-900 hover:border-slate-400 transition-all shrink-0 disabled:opacity-50 app-card"
          >
            {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Перепроверить все
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-6">РУ и большие PDF: после загрузки документ принимается сразу; полный каталог из приложения — кнопка ↻ на карточке или «Перепроверить все».</p>

      {/* Нет профиля */}
      {!hasProfile && (
        <div className="rounded-2xl border border-blue-500/20 p-5 mb-5 flex items-center gap-4" style={{ background: "rgba(59,130,246,0.05)" }}>
          <Info size={20} className="text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-300">Заполните профиль компании — рекомендации будут точнее</p>
            <p className="text-xs text-slate-500 mt-0.5">Сейчас показываем универсальные документы. После заполнения — только нужные вашему бизнесу.</p>
          </div>
          <Link href="/profile" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors shrink-0">
            Заполнить <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Нерелевантные документы */}
      {irrelevantCount > 0 && (
        <div className="rounded-2xl border border-red-500/30 p-5 mb-5 flex items-start gap-4" style={{ background: "rgba(239,68,68,0.07)" }}>
          <ShieldAlert size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">{irrelevantCount} документ(а) не подходят для тендеров</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              AI обнаружил документы, которые не используются в госзакупках. Они не будут учтены при расчёте совпадения с тендерами.
              Удалите их и загрузите: РУ, сертификаты, реестр контрактов. Оборот — в профиле.
            </p>
          </div>
        </div>
      )}

      {/* Обязательные документы */}
      {missing.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/20 p-5 mb-6" style={{ background: "rgba(245,158,11,0.05)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Info size={16} className="text-amber-700" />
            <p className="text-sm font-medium text-yellow-300">Обязательные документы не загружены: {missing.length} шт</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {missing.map((t) => (
              <button
                key={t.value}
                onClick={() => { setSelectedType(t.value); setShowModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-yellow-500/30 text-yellow-300 hover:border-yellow-400/50 transition-all"
                style={{ background: "rgba(245,158,11,0.1)" }}
              >
                <Upload size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {/* Зона загрузки */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
              isDragging ? "border-blue-400 scale-[1.01]" : "border-slate-300 hover:border-blue-500/50"
            }`}
            style={{ background: isDragging ? "rgba(59,130,246,0.08)" : "var(--app-surface)" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${isDragging ? "scale-110" : ""}`} style={{ background: "rgba(59,130,246,0.15)" }}>
              <Upload size={24} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">
              {isDragging ? "Отпустите для загрузки" : "Перетащите файл сюда или нажмите"}
            </h3>
            <p className="text-sm text-slate-600">PDF, JPG, PNG — до 20 МБ</p>
          </div>

          {/* Список документов */}
          {documents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 p-8 text-center app-card">
              <FileText size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-600 font-medium">Документов пока нет</p>
              <p className="text-sm text-slate-500 mt-1">Загрузите первый документ выше</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const info = typeInfo(doc.type);
                const extracted = parseExtracted(doc);
                const isIrrelevant = extracted?.isRelevant !== true;
                const isExpanded = expandedDoc === doc.id;

                return (
                  <div key={doc.id} className={`rounded-xl border overflow-hidden transition-all app-card ${isIrrelevant ? "border-red-300" : "border-slate-200"}`}>
                    {/* Основная строка */}
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: isIrrelevant ? "rgba(239,68,68,0.15)" : `${info.color}20`, color: isIrrelevant ? "#ef4444" : info.color }}>
                        {isIrrelevant ? <XCircle size={18} /> : <FileText size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                        <p className="text-xs text-slate-500">
                          {extracted?.docTypeLabel || extracted?.docType || info.label}
                          {extracted?.number ? ` · №${extracted.number}` : ""}
                          {extracted?.issuedTo ? ` · ${extracted.issuedTo.slice(0, 30)}` : ""}
                        </p>
                        {extracted?.detectedContent && (
                          <p className="text-xs text-slate-500 mt-1">AI: {extracted.detectedContent}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {doc.expiresAt && (
                          <p className="text-xs text-slate-500">до {new Date(doc.expiresAt).toLocaleDateString("ru-RU")}</p>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                          doc.status === "processed" ? (isIrrelevant ? "text-red-600 bg-red-500/10" : "score-green") : doc.status === "pending" ? "score-yellow" : "score-red"
                        }`}>
                          {doc.status === "processed"
                            ? (isIrrelevant ? <><XCircle size={10} /> Не подходит</> : <><CheckCircle size={10} /> Обработан</>)
                            : doc.status === "pending"
                            ? <><Clock size={10} /> Обрабатывается</>
                            : <><AlertCircle size={10} /> Ошибка</>}
                        </span>
                        {extracted && (
                          <button
                            onClick={() => reanalyzeOne(doc.id)}
                            disabled={reanalyzingId === doc.id}
                            className="text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-40"
                            title="Полный разбор PDF (приложение РУ)"
                          >
                            {reanalyzingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                          </button>
                        )}
                        {extracted && (
                          <button
                            onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                            className="text-slate-500 hover:text-slate-700 transition-colors"
                            title="Подробности анализа"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        <button onClick={() => deleteDocument(doc.id)} className="text-slate-600 hover:text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Раскрытый AI анализ */}
                    {isExpanded && extracted && (
                      <div className={`border-t px-4 py-3 bg-slate-50 ${isIrrelevant ? "border-red-100" : "border-slate-100"}`}>
                        {extracted?.warning && (
                          <div className={`flex items-start gap-2 mb-2 p-3 rounded-xl border ${isIrrelevant ? "border-red-500/20" : "border-amber-500/30"}`} style={{ background: isIrrelevant ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)" }}>
                            <AlertCircle size={14} className={`shrink-0 mt-0.5 ${isIrrelevant ? "text-red-600" : "text-amber-600"}`} />
                            <p className={`text-xs leading-relaxed ${isIrrelevant ? "text-red-300" : "text-amber-800"}`}>{extracted.warning}</p>
                          </div>
                        )}
                        {extracted.summary && (
                          <p className="text-xs text-slate-600 mb-2 leading-relaxed">{extracted.summary}</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          {extracted.issuedBy && <span>Выдан: <span className="text-slate-600">{extracted.issuedBy}</span></span>}
                          {extracted.validFrom && <span>С: <span className="text-slate-600">{extracted.validFrom}</span></span>}
                          {extracted.validUntil && <span>До: <span className="text-slate-600">{extracted.validUntil}</span></span>}
                          {extracted.okpd2Code && <span>ОКПД2: <span className="text-slate-600">{extracted.okpd2Code}</span></span>}
                          {extracted.aiProvider && <span className="ml-auto text-slate-600">AI: {extracted.aiProvider}</span>}
                        </div>
                        {extracted.products && extracted.products.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200/50">
                            <p className="text-xs font-medium text-emerald-600 mb-2">
                              Каталог изделий ({extracted.productCount || extracted.products.length} поз.)
                            </p>
                            <ul className="text-xs text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                              {extracted.products.slice(0, 20).map((p, i) => (
                                <li key={i} className="leading-relaxed">• {p}</li>
                              ))}
                              {extracted.products.length > 20 && (
                                <li className="text-slate-600">…и ещё {extracted.products.length - 20}</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Правая колонка — рекомендации */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 p-5 sticky top-8 app-card">
            <h3 className="font-semibold text-slate-900 mb-1">Что нужно вашей компании</h3>
            <p className="text-xs text-slate-500 mb-4">Подобрано по вашим видам деятельности</p>
            <div className="space-y-2">
              {recommendations.map((t) => {
                const done = uploaded.includes(t.value);
                const priorityBadge = t.priority === "required"
                  ? { label: "обязательно", color: "text-red-600", bg: "rgba(239,68,68,0.1)" }
                  : t.priority === "important"
                  ? { label: "важно", color: "text-orange-400", bg: "rgba(249,115,22,0.1)" }
                  : null;
                return (
                  <div key={t.value} className="flex items-start gap-2.5 p-2.5 rounded-xl transition-all" style={{ background: done ? `${t.color}10` : "transparent" }}>
                    <div className="mt-0.5 shrink-0" style={{ color: done ? t.color : "#64748b" }}>
                      {done ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300 mt-0.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium leading-tight ${done ? "text-slate-800" : "text-slate-600"}`}>{t.label}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-tight">{t.reason}</p>
                    </div>
                    {!done && priorityBadge && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${priorityBadge.color} shrink-0`} style={{ background: priorityBadge.bg }}>{priorityBadge.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border border-slate-200 p-6 w-full max-w-md app-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">
                {pendingFile ? `Загрузить: ${pendingFile.name}` : "Выберите тип документа"}
              </h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-900">
                <X size={20} />
              </button>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 rounded-xl text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
                {uploadError}
              </div>
            )}

            {uploadWarning && (
              <div className={`mb-4 p-3 rounded-xl text-sm border ${uploadWarningIsCritical ? "text-red-600 border-red-500/30 bg-red-500/10" : "text-amber-700 border-yellow-500/30 bg-yellow-500/10"}`}
                style={{ background: uploadWarningIsCritical ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)" }}>
                <p className="font-medium mb-1 flex items-center gap-2">
                  {uploadWarningIsCritical ? <XCircle size={15} /> : <AlertCircle size={15} />}
                  {uploadWarningIsCritical ? "Документ не подходит для тендеров" : "Внимание"}
                </p>
                <p className="leading-relaxed text-xs">{uploadWarning}</p>
                <div className="flex gap-3 mt-3">
                  <button onClick={closeModal} className="text-xs underline opacity-70 hover:opacity-100">
                    Понятно, удалить
                  </button>
                  <button onClick={() => { setUploadWarning(""); setShowModal(false); setPendingFile(null); }} className="text-xs underline opacity-70 hover:opacity-100">
                    Оставить в любом случае
                  </button>
                </div>
              </div>
            )}

            {!uploadWarning && (
              <>
                <div className="mb-4">
                  <label className="block text-sm text-slate-600 mb-2">Тип документа</label>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {ALL_DOC_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setSelectedType(t.value)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${selectedType === t.value ? "border-blue-500/50" : "border-slate-200 hover:border-slate-300"}`}
                        style={{ background: selectedType === t.value ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)" }}
                      >
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: selectedType === t.value ? "#3b82f6" : "#475569" }} />
                        <p className="text-sm font-medium text-slate-900">{t.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm text-slate-600 mb-2">Срок действия (если есть)</label>
                  <input
                    type="date"
                    value={selectedExpiry}
                    onChange={(e) => setSelectedExpiry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                    
                  />
                  <p className="text-xs text-slate-500 mt-1">Система напомнит за 30 дней до истечения</p>
                </div>

                {!pendingFile && (
                  <div className="mb-4">
                    <label className="block text-sm text-slate-600 mb-2">Выберите файл</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
                      className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white file:cursor-pointer"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-all text-sm">
                    Отмена
                  </button>
                  <button
                    onClick={uploadFile}
                    disabled={uploading || !pendingFile}
                    className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 text-sm btn-primary"
                  >
                    {uploading
                      ? <><Loader2 size={16} className="animate-spin" /> AI читает документ (до 2 мин для PDF)...</>
                      : <><Upload size={16} /> Загрузить и проверить</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2, FileText, CheckCircle, ArrowRight, Zap, Upload, Tag, Info
} from "lucide-react";
import { COMPANY_REGIONS } from "@/lib/regions";

const STEPS = [
  { id: "profile", icon: Building2, title: "Профиль поставщика", desc: "Опишите номенклатуру и регион работы" },
  { id: "docs", icon: FileText, title: "Загрузите РУ и документы", desc: "AI извлечёт каталог изделий из приложения к РУ" },
];

const OKVED_QUICK = [
  { code: "46.46", label: "Поставка медизделий" },
  { code: "32.50", label: "Мед. расходники" },
  { code: "46.69", label: "Оптовая торговля" },
  { code: "21.20", label: "Производство медизделий" },
];

const DOC_TYPES = [
  { value: "medical_ru", label: "РУ на мед. изделия" },
  { value: "certificate", label: "Сертификат / декларация" },
  { value: "contracts", label: "Реестр контрактов ЕИС" },
  { value: "other", label: "Другой документ" },
];

interface Props {
  profileDone: boolean;
  docCount: number;
  companyName: string;
}

const ONBOARDING_DRAFT_KEY = "tenderai-onboarding-profile";

export default function OnboardingClient({ profileDone, docCount, companyName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"profile" | "docs">(profileDone ? "docs" : "profile");
  const [draftReady, setDraftReady] = useState(false);

  // Profile form
  const [description, setDescription] = useState("");
  const [okvedCodes, setOkvedCodes] = useState<string[]>(["46.46"]);
  const [region, setRegion] = useState("");
  const [revenue, setRevenue] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          description?: string;
          okvedCodes?: string[];
          region?: string;
          revenue?: string;
        };
        if (d.description) setDescription(d.description);
        if (d.okvedCodes?.length) setOkvedCodes(d.okvedCodes);
        if (d.region) setRegion(d.region);
        if (d.revenue) setRevenue(d.revenue);
      }
    } catch {
      /* ignore */
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady || profileDone) return;
    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ description, okvedCodes, region, revenue })
    );
  }, [description, okvedCodes, region, revenue, draftReady, profileDone]);

  // Doc upload
  const [selectedType, setSelectedType] = useState("medical_ru");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploadedCount, setUploadedCount] = useState(docCount);

  function toggleOkved(code: string) {
    setOkvedCodes((prev) => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  async function saveProfile() {
    if (description.length < 20) { setProfileError("Опишите деятельность компании подробнее (минимум 20 символов)"); return; }
    if (okvedCodes.length === 0) { setProfileError("Выберите хотя бы один вид деятельности"); return; }
    setSavingProfile(true);
    setProfileError("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ description, okvedCodes, region, revenue, companyName, userName: "" }),
      });
      clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setProfileError("Сессия не сохранилась. Войдите снова — введённые данные останутся в форме.");
        return;
      }
      if (!res.ok) {
        setProfileError(data.error || "Ошибка сохранения");
        return;
      }
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      setStep("docs");
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setProfileError("Сервер долго не отвечает. Подождите и попробуйте снова — возможно, идёт тяжёлая операция на вашем ПК.");
      } else {
        setProfileError("Ошибка сохранения. Проверьте соединение с сервером.");
      }
    }
    finally { setSavingProfile(false); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    setUploadError("");
    try {
      const safeName = file.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || `document.${file.name.split(".").pop() || "pdf"}`;

      const fileForUpload =
        safeName === file.name
          ? file
          : new File([file], safeName, { type: file.type || "application/pdf", lastModified: file.lastModified });

      const form = new FormData();
      form.append("file", fileForUpload);
      form.append("originalName", file.name);
      form.append("type", selectedType);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error); return; }
      const label = DOC_TYPES.find(d => d.value === selectedType)?.label || file.name;
      setUploadedDocs(prev => [...prev, label]);
      setUploadedCount(prev => prev + 1);
      e.target.value = "";
    } catch { setUploadError("Ошибка загрузки"); }
    finally { setUploadingDoc(false); }
  }

  const totalDocs = uploadedCount;
  const canFinish = totalDocs >= 2;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 app-shell">
      <div className="w-full max-w-xl">
        {/* Лого */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center btn-primary">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">TenderAI</span>
        </div>

        {/* Прогресс */}
        <div className="flex gap-3 mb-8">
          {STEPS.map((s, i) => {
            const done = (s.id === "profile" && (profileDone || step === "docs")) || (s.id === "docs" && canFinish);
            const active = s.id === step;
            return (
              <div key={s.id} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all ${active ? "border-blue-500/40" : done ? "border-emerald-500/30" : "border-slate-200"}`} style={{ background: active ? "rgba(59,130,246,0.08)" : done ? "rgba(16,185,129,0.05)" : "var(--app-surface)" }}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-blue-500" : done ? "bg-emerald-500" : "bg-slate-200"}`}>
                  {done ? (
                    <CheckCircle size={16} className="text-white" />
                  ) : (
                    <s.icon size={16} className={active ? "text-white" : "text-slate-600"} />
                  )}
                </div>
                <div>
                  <p className={`text-xs font-medium ${active ? "text-blue-700" : done ? "text-emerald-600" : "text-slate-600"}`}>Шаг {i + 1}</p>
                  <p className="text-xs text-slate-500">{s.title}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Шаг 1 — Профиль */}
        {step === "profile" && (
          <div className="rounded-2xl border border-slate-200 p-6 app-card">
            <h1 className="text-xl font-bold text-slate-900 mb-1">Профиль поставщика медизделий</h1>
            <p className="text-sm text-slate-600 mb-6">Укажите номенклатуру — AI найдёт медтендеры, где ваш каталог из РУ совпадает с ТЗ</p>

            {profileError && (
              <div className="mb-4 p-3 rounded-xl text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
                {profileError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-slate-600 mb-1.5">Чем занимается компания</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например: Поставляем медицинские изделия для стационаров — стерильные комплекты белья, расходные материалы, перевязочные средства. Работаем по РФ, есть РУ Росздравнадзора с приложением на всю номенклатуру."
                rows={4}
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors resize-none"
                
              />
              <p className="text-xs text-slate-500 mt-1">{description.length} символов — чем подробнее, тем точнее результат</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-slate-600 mb-2 flex items-center gap-1">
                <Tag size={13} /> Виды деятельности
              </label>
              <div className="flex flex-wrap gap-2">
                {OKVED_QUICK.map((o) => {
                  const sel = okvedCodes.includes(o.code);
                  return (
                    <button
                      key={o.code}
                      type="button"
                      onClick={() => toggleOkved(o.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${sel ? "border-blue-500 text-blue-300" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                      style={{ background: sel ? "rgba(59,130,246,0.15)" : "transparent" }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-5 p-4 rounded-xl border border-emerald-500/20" style={{ background: "rgba(16,185,129,0.06)" }}>
              <label className="block text-sm font-medium text-emerald-700 mb-1">Годовой оборот компании, ₽</label>
              <p className="text-xs text-slate-500 mb-2">
                Укажите сами — для поставщиков это заменяет загрузку баланса. Можно изменить в профиле в любой момент.
              </p>
              <input
                type="number"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="Например: 15000000"
                className="w-full px-3 py-2.5 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
            </div>

            <div className="grid grid-cols-1 gap-3 mb-6">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Регион работы (необязательно)</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl app-input text-sm transition-colors"
                >
                  <option value="">Все регионы</option>
                  {COMPANY_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 btn-primary"
            >
              {savingProfile ? "Сохраняем..." : <>Продолжить <ArrowRight size={16} /></>}
            </button>
          </div>
        )}

        {/* Шаг 2 — Документы */}
        {step === "docs" && (
          <div className="rounded-2xl border border-slate-200 p-6 app-card">
            <h1 className="text-xl font-bold text-slate-900 mb-1">Документы для медтендеров</h1>
            <p className="text-sm text-slate-600 mb-2">Главное — РУ Росздравнадзора с приложением (полный перечень изделий)</p>

            <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 mb-5 text-xs text-slate-600" style={{ background: "rgba(59,130,246,0.05)" }}>
              <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
              Загрузите РУ (ФСР или РЗН) с приложением — AI извлечёт каталог и сверит с ТЗ каждого тендера.
              Сертификат на один товар не заменяет РУ. ЕГРЮЛ не обязателен — оборот укажите в профиле.
            </div>

            {uploadError && (
              <div className="mb-4 p-3 rounded-xl text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
                {uploadError}
              </div>
            )}

            {/* Загруженные */}
            {uploadedDocs.length > 0 && (
              <div className="mb-4 space-y-2">
                {uploadedDocs.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: "rgba(16,185,129,0.1)" }}>
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span className="text-sm text-emerald-700">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Выбор типа */}
            <div className="mb-3">
              <label className="block text-sm text-slate-600 mb-2">Тип следующего документа</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DOC_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSelectedType(t.value)}
                    className={`text-left px-3 py-2 rounded-lg text-xs border transition-all ${selectedType === t.value ? "border-blue-500/50 text-blue-300" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    style={{ background: selectedType === t.value ? "rgba(59,130,246,0.1)" : "transparent" }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопка загрузки */}
            <label className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all mb-5 ${uploadingDoc ? "opacity-50 cursor-wait" : "cursor-pointer hover:border-blue-400 text-slate-700 hover:text-slate-900"}`} style={{ borderColor: "#475569" }}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileUpload} disabled={uploadingDoc} />
              <Upload size={16} />
              {uploadingDoc ? "Загрузка..." : "Нажмите чтобы выбрать файл"}
            </label>

            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-600">Загружено: <span className={totalDocs >= 2 ? "text-emerald-600 font-bold" : "text-slate-900 font-bold"}>{totalDocs}</span> / минимум 2</p>
              {totalDocs < 2 && <p className="text-xs text-slate-500">ещё {2 - totalDocs} {2 - totalDocs === 1 ? "документ" : "документа"}</p>}
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              disabled={!canFinish}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-white btn-primary transition-all ${canFinish ? "hover:opacity-90" : "opacity-40 cursor-not-allowed"}`}
              style={{ background: canFinish ? "linear-gradient(135deg, #3b82f6, #10b981)" : "#334155" }}
            >
              {canFinish ? <>Перейти к тендерам <ArrowRight size={16} /></> : `Нужно ещё ${2 - totalDocs} документа`}
            </button>

            {totalDocs > 0 && (
              <button onClick={() => router.push("/dashboard")} className="w-full mt-2 py-2 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                Пропустить пока (анализ будет неполным)
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-600 mt-6">
          Хотите настроить позже?{" "}
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800">Перейти на дашборд</Link>
        </p>
      </div>
    </div>
  );
}

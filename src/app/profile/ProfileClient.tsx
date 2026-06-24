"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Save, Loader2, CheckCircle, MapPin, DollarSign, FileText, Tag, Palette } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { regionOptionsForSelect } from "@/lib/regions";

const OKVED_OPTIONS = [
  { code: "26.20", label: "Производство компьютеров и оборудования" },
  { code: "62.01", label: "Разработка программного обеспечения" },
  { code: "62.02", label: "IT-консультирование и техподдержка" },
  { code: "43.21", label: "Монтаж электрических проводок и оборудования" },
  { code: "43.22", label: "Монтаж сантехнических, отопительных систем" },
  { code: "41.20", label: "Строительство жилых и нежилых зданий" },
  { code: "80.20", label: "Деятельность по обеспечению безопасности" },
  { code: "46.46", label: "Оптовая торговля медизделиями" },
  { code: "32.50", label: "Медицинские изделия и расходники" },
  { code: "47.91", label: "Торговля по почте или интернету" },
  { code: "31.01", label: "Производство мебели для офисов" },
  { code: "85.41", label: "Образование дополнительное для детей и взрослых" },
];

interface Props {
  user: {
    id: string;
    name: string | null;
    email: string;
    company: {
      id: string;
      name: string;
      inn: string;
      ogrn: string | null;
      region: string | null;
      revenue: number | null;
      description: string | null;
      okvedCodes: string;
    } | null;
  };
}

export default function ProfileClient({ user }: Props) {
  const router = useRouter();
  const company = user.company;
  const regionOptions = useMemo(
    () => regionOptionsForSelect(company?.region),
    [company?.region]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    companyName: company?.name || "",
    inn: company?.inn || "",
    ogrn: company?.ogrn || "",
    region: company?.region || "",
    revenue: company?.revenue?.toString() || "",
    description: company?.description || "",
    okvedCodes: (() => {
      try { return JSON.parse(company?.okvedCodes || "[]") as string[]; }
      catch { return [] as string[]; }
    })(),
    userName: user.name || "",
  });

  function toggleOkved(code: string) {
    setForm((f) => ({
      ...f,
      okvedCodes: f.okvedCodes.includes(code)
        ? f.okvedCodes.filter((c) => c !== code)
        : [...f.okvedCodes, code],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      if (data.company?.region !== undefined) {
        setForm((f) => ({ ...f, region: data.company.region || "" }));
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Профиль компании</h1>
        <p className="text-slate-600">Заполните информацию — AI использует её для точного анализа тендеров</p>
      </div>

      <div className="rounded-2xl border border-slate-200 p-6 app-card mb-6">
        <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Palette size={18} className="text-blue-600" /> Внешний вид
        </h2>
        <p className="text-sm text-slate-600 mb-4">Выберите светлую или тёмную тему — настройка сохранится в браузере</p>
        <ThemeToggle />
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="p-3 rounded-xl text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
            {error}
          </div>
        )}

        {/* Личные данные */}
        <div className="rounded-2xl border border-slate-200 p-6 app-card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-blue-600" /> Личные данные
          </h2>
          <div>
            <label className="block text-sm text-slate-600 mb-1.5">Ваше имя</label>
            <input
              value={form.userName}
              onChange={(e) => setForm({ ...form, userName: e.target.value })}
              placeholder="Иван Иванов"
              className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
              
            />
          </div>
        </div>

        {/* Основная информация */}
        <div className="rounded-2xl border border-slate-200 p-6 app-card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-blue-600" /> Данные компании
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1.5">Полное название компании</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder='ООО "Ваша Компания"'
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">ИНН</label>
              <input
                value={form.inn}
                onChange={(e) => setForm({ ...form, inn: e.target.value })}
                placeholder="1234567890"
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">ОГРН</label>
              <input
                value={form.ogrn}
                onChange={(e) => setForm({ ...form, ogrn: e.target.value })}
                placeholder="1234567890123"
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
            </div>
          </div>
        </div>

        {/* Регион и финансы */}
        <div className="rounded-2xl border border-slate-200 p-6 app-card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MapPin size={18} className="text-emerald-600" /> Регион и финансы
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">Основной регион работы</label>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
              >
                <option value="">Все регионы</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                «Все регионы» — работаете по всей России. Конкретный регион учитывается в прогнозе и уведомлениях.
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">
                <DollarSign size={13} className="inline mr-1" />
                Годовой оборот (руб)
              </label>
              <input
                type="number"
                value={form.revenue}
                onChange={(e) => setForm({ ...form, revenue: e.target.value })}
                placeholder="5000000"
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
              <p className="text-xs text-slate-500 mt-1">
                Используется для сравнения с требованиями тендеров. Для поставщиков заменяет загрузку баланса — изменить можно в любой момент.
              </p>
            </div>
          </div>
        </div>

        {/* Описание деятельности */}
        <div className="rounded-2xl border border-slate-200 p-6 app-card">
          <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <FileText size={18} className="text-purple-400" /> Чем занимается компания
          </h2>
          <p className="text-xs text-slate-500 mb-4">AI читает это описание и предлагает подходящие тендеры и нужные документы</p>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Опишите своими словами что делает компания. Например: «Мы занимаемся поставкой и монтажом систем видеонаблюдения и контроля доступа для государственных объектов. Работаем в Москве и Московской области. Есть лицензия ФСБ. Делали проекты для школ, больниц и административных зданий.»"
            rows={5}
            className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors resize-none"
            
          />
          <p className="text-xs text-slate-500 mt-2">Чем подробнее — тем точнее AI подберёт тендеры</p>
        </div>

        {/* ОКВЭД */}
        <div className="rounded-2xl border border-slate-200 p-6 app-card">
          <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <Tag size={18} className="text-amber-700" /> Виды деятельности (ОКВЭД)
          </h2>
          <p className="text-xs text-slate-500 mb-4">Отметьте всё что подходит — это помогает найти больше тендеров</p>
          <div className="grid grid-cols-1 gap-2">
            {OKVED_OPTIONS.map((o) => {
              const selected = form.okvedCodes.includes(o.code);
              return (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => toggleOkved(o.code)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    selected
                      ? "border-blue-500/50 bg-blue-50 dark:bg-blue-500/10"
                      : "border-slate-200 hover:border-slate-300 bg-transparent"
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${selected ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}>
                    {selected && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-slate-500 font-mono w-12 shrink-0">{o.code}</span>
                  <span className={`text-sm ${selected ? "text-blue-800 dark:text-blue-200" : "text-slate-700"}`}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 btn-primary"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? "Сохраняем..." : "Сохранить профиль"}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 animate-fade-in">
              <CheckCircle size={16} /> Сохранено!
            </div>
          )}
        </div>
      </form>
    </main>
  );
}

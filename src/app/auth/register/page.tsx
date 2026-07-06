"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";

const DRAFT_KEY = "tenderai-register-draft";

type RegisterForm = {
  name: string;
  email: string;
  password: string;
  companyName: string;
  inn: string;
};

const EMPTY_FORM: RegisterForm = {
  name: "",
  email: "",
  password: "",
  companyName: "",
  inn: "",
};

function loadDraft(): RegisterForm {
  if (typeof window === "undefined") return EMPTY_FORM;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_FORM;
    return { ...EMPTY_FORM, ...JSON.parse(raw) };
  } catch {
    return EMPTY_FORM;
  }
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);

  useEffect(() => {
    setForm(loadDraft());
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        name: form.name,
        email: form.email,
        companyName: form.companyName,
        inn: form.inn,
      })
    );
  }, [form.name, form.email, form.companyName, form.inn]);

  function updateForm(patch: Partial<RegisterForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const innDigits = form.inn.replace(/\D/g, "");
    if (innDigits.length !== 10 && innDigits.length !== 12) {
      setError("ИНН должен содержать 10 или 12 цифр");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, inn: innDigits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка регистрации");
        return;
      }
      sessionStorage.removeItem(DRAFT_KEY);
      window.location.assign(data.redirect || `/auth/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch {
      setError("Ошибка соединения с сервером. Проверьте, что сайт открыт по тому же адресу (IP:3000), не localhost с другого устройства.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center btn-primary">
              <Zap size={20} className="text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">TenderAI</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Начать бесплатно</h1>
          <p className="text-slate-600">7 дней пробного доступа после подтверждения email</p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-8 app-card">
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ваше имя</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="Иван Иванов"
                  className="w-full px-4 py-3 rounded-xl app-input text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">ИНН компании</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  autoComplete="off"
                  value={form.inn}
                  onChange={(e) => updateForm({ inn: e.target.value.replace(/[^\d]/g, "").slice(0, 12) })}
                  placeholder="1234567890"
                  className="w-full px-4 py-3 rounded-xl app-input text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Название компании</label>
              <input
                type="text"
                required
                autoComplete="organization"
                value={form.companyName}
                onChange={(e) => updateForm({ companyName: e.target.value })}
                placeholder='ООО "Ваша компания"'
                className="w-full px-4 py-3 rounded-xl app-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                placeholder="director@company.ru"
                className="w-full px-4 py-3 rounded-xl app-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => updateForm({ password: e.target.value })}
                  placeholder="Минимум 6 символов"
                  className="w-full px-4 py-3 rounded-xl app-input text-sm pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 mt-2 btn-primary"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : (<><CheckCircle size={18} />Создать аккаунт</>)}
            </button>
          </form>
          <p className="text-xs text-slate-500 text-center mt-4">
            Данные формы сохраняются в браузере до успешной регистрации
          </p>
        </div>
        <p className="text-center text-sm text-slate-600 mt-6">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-800 font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}

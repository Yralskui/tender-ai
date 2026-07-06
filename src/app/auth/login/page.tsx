"use client";
import { useState } from "react";
import Link from "next/link";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnverifiedEmail("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED" && data.email) {
          setUnverifiedEmail(data.email);
        }
        setError(data.error || "Ошибка входа");
        return;
      }
      window.location.assign("/onboarding");
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 app-shell">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center btn-primary">
              <Zap size={20} className="text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">TenderAI</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Добро пожаловать</h1>
          <p className="text-slate-600">Войдите в свой аккаунт</p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-8 app-card">
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-600 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
              {error}
              {unverifiedEmail && (
                <p className="mt-2">
                  <Link
                    href={`/auth/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                    className="text-blue-600 hover:text-blue-800 font-medium underline"
                  >
                    Отправить письмо подтверждения снова
                  </Link>
                </p>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="company@example.ru"
                className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors"
                
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors pr-12"
                  
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 btn-primary"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Войти"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-slate-600 mt-6">
          Нет аккаунта?{" "}
          <Link href="/auth/register" className="text-blue-600 hover:text-blue-800 font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}

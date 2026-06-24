"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  CheckCircle,
  Zap,
  Star,
  CreditCard,
  Loader2,
  Shield,
  TrendingUp,
  Bell,
  FileText,
} from "lucide-react";

const PLANS = [
  {
    id: "start",
    name: "Старт",
    price: 4900,
    period: "мес",
    desc: "До 3 регионов",
    features: [
      "До 3 регионов мониторинга",
      "Анализ документов до 20 шт",
      "Email уведомления",
      "Базовый анализ тендеров",
    ],
    highlight: false,
    color: "#3b82f6",
  },
  {
    id: "pro",
    name: "Профи",
    price: 9900,
    period: "мес",
    desc: "Всё и сразу",
    features: [
      "Все регионы России",
      "Неограниченные документы",
      "Telegram уведомления",
      "Детальный gap-анализ",
      "Карта роста компании",
      "Автозаполнение заявок",
    ],
    highlight: true,
    color: "#10b981",
  },
  {
    id: "team",
    name: "Команда",
    price: 19900,
    period: "мес",
    desc: "Для команды",
    features: [
      "Всё из Профи",
      "До 5 пользователей",
      "API доступ",
      "Приоритетная поддержка",
      "Личный менеджер",
    ],
    highlight: false,
    color: "#8b5cf6",
  },
];

export default function PaywallClient({ userName, isExpired, currentPlan }: { userName: string; isExpired: boolean; currentPlan: string | null }) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"plans" | "payment">("plans");
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [success, setSuccess] = useState(false);

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Имитация обработки платежа — здесь подключается ЮKassa/Тинькофф
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch("/api/payment/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan }),
    });

    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2500);
    }
    setLoading(false);
  }

  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" >
        <div className="text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center animate-pulse-glow" style={{ background: "rgba(16,185,129,0.2)", border: "2px solid #10b981" }}>
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Оплата прошла успешно!</h2>
          <p className="text-slate-600">Переходим в платформу...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" >
      {/* Шапка */}
      <div className="border-b border-slate-200 py-4 px-6 flex items-center justify-between app-nav-glass">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center btn-primary">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-slate-900">TenderAI</span>
        </div>
        <div className="flex items-center gap-4">
          {!isExpired && (
            <button onClick={() => router.push("/dashboard")} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
              ← Вернуться
            </button>
          )}
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Выйти
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Заголовок */}
        <div className="text-center mb-12">
          {isExpired ? (
            <>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <Lock size={28} className="text-red-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-3">
                Пробный период завершён, {userName}
              </h1>
              <p className="text-slate-600 text-lg max-w-xl mx-auto">
                7 дней бесплатного доступа использованы. Выберите тариф чтобы продолжить.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
                <Zap size={28} className="text-blue-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-3">
                Выберите тариф, {userName}
              </h1>
              <p className="text-slate-600 text-lg max-w-xl mx-auto">
                {currentPlan ? `Текущий тариф: ${PLANS.find(p => p.id === currentPlan)?.name || currentPlan}. Можно изменить в любой момент.` : "Один выигранный тендер окупает годовую подписку в десятки раз."}
              </p>
            </>
          )}
        </div>

        {step === "plans" ? (
          <>
        {/* Что включено */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[
            { icon: <FileText size={18} />, text: "Анализ документов", color: "#3b82f6" },
            { icon: <TrendingUp size={18} />, text: "Карта роста", color: "#10b981" },
            { icon: <Bell size={18} />, text: "Telegram уведомления", color: "#8b5cf6" },
            { icon: <Shield size={18} />, text: "Gap-анализ тендеров", color: "#f59e0b" },
          ].map((item, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4 text-center app-card">
              <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center" style={{ background: `${item.color}20`, color: item.color }}>
                {item.icon}
              </div>
              <p className="text-xs text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>

            {/* Тарифы */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`rounded-2xl p-6 text-left border-2 transition-all ${selectedPlan === p.id ? "" : "border-slate-200 opacity-75 hover:opacity-90"}`}
                  style={{
                    background: selectedPlan === p.id ? `linear-gradient(135deg, ${p.color}15, var(--app-surface))` : "var(--app-surface)",
                    borderColor: selectedPlan === p.id ? p.color : undefined,
                  }}
                >
                  {p.highlight && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-slate-900 mb-3 btn-primary">
                      <Star size={10} /> Популярный
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{p.name}</h3>
                  <p className="text-xs text-slate-600 mb-3">{p.desc}</p>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold text-slate-900">{p.price.toLocaleString("ru-RU")} ₽</span>
                    <span className="text-slate-600 text-sm">/{p.period}</span>
                  </div>
                  <ul className="space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep("payment")}
                className="px-10 py-4 rounded-xl font-bold text-slate-900 text-lg transition-all hover:opacity-90 inline-flex items-center gap-3 btn-primary"
              >
                <CreditCard size={20} />
                Оплатить тариф «{plan.name}» — {plan.price.toLocaleString("ru-RU")} ₽/мес
              </button>
              <p className="text-xs text-slate-500 mt-3">Безопасный платёж · Отмена в любой момент</p>
            </div>
          </>
        ) : (
          /* Форма оплаты */
          <div className="max-w-md mx-auto">
            <button onClick={() => setStep("plans")} className="text-sm text-slate-600 hover:text-slate-900 mb-6 flex items-center gap-2 transition-colors">
              ← Изменить тариф
            </button>

            <div className="rounded-2xl border border-slate-200 p-6 mb-6 app-card">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                <div>
                  <p className="font-semibold text-slate-900">Тариф «{plan.name}»</p>
                  <p className="text-sm text-slate-600">Ежемесячная подписка</p>
                </div>
                <p className="text-xl font-bold text-slate-900">{plan.price.toLocaleString("ru-RU")} ₽</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Shield size={14} />
                Безопасная оплата · Данные карты не хранятся
              </div>
            </div>

            <form onSubmit={handlePayment} className="rounded-2xl border border-slate-200 p-6 space-y-4 app-card">
              <h3 className="font-semibold text-slate-900 mb-2">Данные карты</h3>

              <div>
                <label className="block text-xs text-slate-600 mb-1.5">Номер карты</label>
                <input
                  required
                  placeholder="0000 0000 0000 0000"
                  value={cardForm.number}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                    const formatted = v.match(/.{1,4}/g)?.join(" ") || v;
                    setCardForm({ ...cardForm, number: formatted });
                  }}
                  maxLength={19}
                  className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors font-mono"
                  
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1.5">Срок действия</label>
                  <input
                    required
                    placeholder="MM/YY"
                    value={cardForm.expiry}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2);
                      setCardForm({ ...cardForm, expiry: v });
                    }}
                    maxLength={5}
                    className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors font-mono"
                    
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1.5">CVV</label>
                  <input
                    required
                    type="password"
                    placeholder="•••"
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    maxLength={3}
                    className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors font-mono"
                    
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1.5">Имя владельца карты</label>
                <input
                  required
                  placeholder="IVAN IVANOV"
                  value={cardForm.name}
                  onChange={(e) => setCardForm({ ...cardForm, name: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 rounded-xl app-input w-full px-4 py-3 rounded-xl text-sm transition-colors font-mono"
                  
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-slate-900 text-base flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 mt-2 btn-primary"
              >
                {loading ? (
                  <><Loader2 size={20} className="animate-spin" /> Обработка платежа...</>
                ) : (
                  <><CreditCard size={20} /> Оплатить {plan.price.toLocaleString("ru-RU")} ₽</>
                )}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Нажимая кнопку, вы соглашаетесь с{" "}
                <Link href="#" className="text-blue-600">условиями использования</Link>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

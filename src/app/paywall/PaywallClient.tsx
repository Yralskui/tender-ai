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
  Users,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import {
  finalCheckoutPrice,
  formatRub,
  YEARLY_DISCOUNT_PERCENT,
  type BillingPeriod,
  type PlanId,
} from "@/lib/pricing";

const PLANS: Array<{
  id: PlanId;
  name: string;
  desc: string;
  features: string[];
  highlight: boolean;
  color: string;
  icon: typeof Sparkles;
}> = [
  {
    id: "pro",
    name: "Профи",
    desc: "Для активного участия в тендерах",
    features: [
      "Все регионы России",
      "Неограниченные документы",
      "Email уведомления",
      "Детальный gap-анализ",
      "Карта роста компании",
      "Оценка маржи по прайсу",
      "Проверка национального режима",
    ],
    highlight: true,
    color: "#10b981",
    icon: Sparkles,
  },
  {
    id: "team",
    name: "Команда",
    desc: "Для отдела продаж и тендерного отдела",
    features: [
      "Всё из Профи",
      "До 5 пользователей",
      "Персональный онбординг команды",
      "Приоритетная поддержка",
      "Личный менеджер",
    ],
    highlight: false,
    color: "#8b5cf6",
    icon: Users,
  },
];

function planDisplayName(currentPlan: string | null): string {
  if (!currentPlan) return "";
  const base = currentPlan.replace(/_year$/, "");
  const p = PLANS.find((x) => x.id === base);
  const yearly = currentPlan.endsWith("_year");
  return p ? `${p.name}${yearly ? " (год)" : ""}` : currentPlan;
}

export default function PaywallClient({
  userName,
  isExpired,
  currentPlan,
}: {
  userName: string;
  isExpired: boolean;
  currentPlan: string | null;
}) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"plans" | "payment">("plans");
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [success, setSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountPercent: number;
    label: string;
  } | null>(null);

  const promoDiscount = promoApplied?.discountPercent ?? 0;
  const pricing = finalCheckoutPrice(selectedPlan, billingPeriod, promoDiscount);
  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  async function applyPromo() {
    setPromoError("");
    setPromoLoading(true);
    try {
      const res = await fetch("/api/payment/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || "Промокод недействителен");
        setPromoApplied(null);
        return;
      }
      setPromoApplied({
        code: data.code,
        discountPercent: data.discountPercent,
        label: data.label,
      });
      setPromoInput(data.code);
    } catch {
      setPromoError("Не удалось проверить промокод");
    } finally {
      setPromoLoading(false);
    }
  }

  function clearPromo() {
    setPromoApplied(null);
    setPromoInput("");
    setPromoError("");
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setPaymentError("");
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch("/api/payment/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: selectedPlan,
        billingPeriod,
        promoCode: promoApplied?.code || "",
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2500);
    } else {
      setPaymentError(data.error || "Ошибка оплаты");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center animate-pulse-glow"
            style={{ background: "rgba(16,185,129,0.2)", border: "2px solid #10b981" }}
          >
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Оплата прошла успешно!</h2>
          <p className="text-slate-600">Переходим в платформу...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-slate-200 py-4 px-6 flex items-center justify-between app-nav-glass">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center btn-primary">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-slate-900">TenderAI</span>
        </div>
        <div className="flex items-center gap-4">
          {!isExpired && (
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              ← Вернуться
            </button>
          )}
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/");
            }}
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          {isExpired ? (
            <>
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                <Lock size={28} className="text-red-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-3">Пробный период завершён, {userName}</h1>
              <p className="text-slate-600 text-lg max-w-xl mx-auto">
                7 дней бесплатного доступа использованы. Выберите тариф, чтобы продолжить работу с тендерами.
              </p>
            </>
          ) : (
            <>
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
              >
                <Zap size={28} className="text-blue-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-3">Выберите тариф, {userName}</h1>
              <p className="text-slate-600 text-lg max-w-xl mx-auto">
                {currentPlan
                  ? `Текущий тариф: ${planDisplayName(currentPlan)}. Можно сменить в любой момент.`
                  : "Один выигранный тендер окупает подписку в десятки раз."}
              </p>
            </>
          )}
        </div>

        {step === "plans" ? (
          <>
            <div className="flex justify-center mb-8">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    billingPeriod === "monthly"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Помесячно
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("yearly")}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                    billingPeriod === "yearly"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  На год
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                    −{YEARLY_DISCOUNT_PERCENT}%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { icon: <FileText size={18} />, text: "Анализ документов", color: "#3b82f6" },
                { icon: <TrendingUp size={18} />, text: "Карта роста", color: "#10b981" },
                { icon: <Bell size={18} />, text: "Уведомления", color: "#8b5cf6" },
                { icon: <Shield size={18} />, text: "Gap-анализ", color: "#f59e0b" },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3 text-center app-card">
                  <div
                    className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
                    style={{ background: `${item.color}20`, color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <p className="text-xs text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6 items-stretch max-w-3xl mx-auto">
              {PLANS.map((p) => {
                const Icon = p.icon;
                const selected = selectedPlan === p.id;
                const cardPricing = finalCheckoutPrice(p.id, billingPeriod, promoDiscount);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    className={`relative rounded-2xl p-7 text-left border-2 transition-all duration-200 flex flex-col h-full ${
                      selected
                        ? "shadow-lg shadow-slate-200/80"
                        : "border-slate-200 opacity-90 hover:opacity-100 hover:border-slate-300"
                    } ${p.highlight && selected ? "md:-translate-y-1" : ""}`}
                    style={{
                      background: selected
                        ? `linear-gradient(160deg, ${p.color}12 0%, var(--app-surface) 55%)`
                        : "var(--app-surface)",
                      borderColor: selected ? p.color : undefined,
                    }}
                  >
                    {p.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white btn-primary shadow-md">
                        <Star size={10} fill="currentColor" /> Рекомендуем
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: `${p.color}22`, color: p.color }}
                          >
                            <Icon size={18} />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                        </div>
                        <p className="text-sm text-slate-600 pl-11">{p.desc}</p>
                      </div>
                      {selected && <CheckCircle size={22} className="text-emerald-600 shrink-0 mt-1" />}
                    </div>

                    <div className="mb-5 pl-11">
                      {billingPeriod === "yearly" ? (
                        <>
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-4xl font-extrabold tracking-tight text-slate-900">
                              {formatRub(cardPricing.totalAmount)}
                            </span>
                            <span className="text-slate-500 text-base font-medium">₽/год</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            ≈ {formatRub(cardPricing.perMonthEquivalent)} ₽/мес
                          </p>
                          {cardPricing.yearlySavings > 0 && (
                            <p className="text-xs text-emerald-600 mt-0.5">
                              Экономия {formatRub(cardPricing.yearlySavings)} ₽ vs помесячно
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-extrabold tracking-tight text-slate-900">
                              {formatRub(cardPricing.totalAmount)}
                            </span>
                            <span className="text-slate-500 text-base font-medium">₽/мес</span>
                          </div>
                        </>
                      )}
                      {promoApplied && (
                        <p className="text-xs text-violet-600 mt-1">
                          С промокодом −{promoApplied.discountPercent}%
                        </p>
                      )}
                    </div>

                    <ul className="space-y-2.5 flex-1 pl-11">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="max-w-md mx-auto mb-8 rounded-2xl border border-slate-200 p-4 app-card">
              <div className="flex items-center gap-2 mb-3">
                <Tag size={16} className="text-violet-600" />
                <span className="text-sm font-semibold text-slate-900">Промокод от поддержки</span>
              </div>
              {promoApplied ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
                  <div>
                    <p className="font-mono font-bold text-violet-800">{promoApplied.code}</p>
                    <p className="text-xs text-violet-600">
                      {promoApplied.label} · −{promoApplied.discountPercent}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPromo}
                    className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-700"
                    aria-label="Убрать промокод"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={promoInput}
                    onChange={(e) => {
                      setPromoInput(e.target.value.toUpperCase());
                      setPromoError("");
                    }}
                    placeholder="FIRST10"
                    className="flex-1 px-4 py-2.5 rounded-xl app-input text-sm font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => void applyPromo()}
                    disabled={promoLoading || !promoInput.trim()}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white btn-primary disabled:opacity-50"
                  >
                    {promoLoading ? <Loader2 size={16} className="animate-spin" /> : "Применить"}
                  </button>
                </div>
              )}
              {promoError && <p className="text-xs text-red-600 mt-2">{promoError}</p>}
              <p className="text-xs text-slate-500 mt-2">Один промокод — один раз на аккаунт</p>
            </div>

            <div className="text-center max-w-md mx-auto">
              <button
                onClick={() => setStep("payment")}
                className="w-full px-8 py-4 rounded-xl font-bold text-white text-lg transition-all hover:opacity-95 hover:shadow-lg inline-flex items-center justify-center gap-3 btn-primary"
              >
                <CreditCard size={20} />
                Оплатить «{plan.name}» — {formatRub(pricing.totalAmount)} ₽
                {billingPeriod === "yearly" ? "/год" : "/мес"}
              </button>
              <p className="text-xs text-slate-500 mt-3">Безопасный платёж · Отмена в любой момент</p>
            </div>
          </>
        ) : (
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setStep("plans")}
              className="text-sm text-slate-600 hover:text-slate-900 mb-6 flex items-center gap-2 transition-colors"
            >
              ← Изменить тариф
            </button>

            <div className="rounded-2xl border border-slate-200 p-6 mb-6 app-card space-y-3">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <p className="font-semibold text-slate-900">Тариф «{plan.name}»</p>
                  <p className="text-sm text-slate-600">
                    {billingPeriod === "yearly" ? "Оплата за 12 месяцев" : "Ежемесячная подписка"}
                  </p>
                </div>
              </div>
              {pricing.yearlySavings > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Скидка за год</span>
                  <span>−{formatRub(pricing.yearlySavings)} ₽</span>
                </div>
              )}
              {promoApplied && (
                <div className="flex justify-between text-sm text-violet-600">
                  <span>Промокод {promoApplied.code}</span>
                  <span>−{promoApplied.discountPercent}%</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                <span className="font-medium text-slate-900">К оплате</span>
                <span className="text-2xl font-bold text-slate-900">{formatRub(pricing.totalAmount)} ₽</span>
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
                  className="w-full px-4 py-3 rounded-xl app-input text-sm transition-colors font-mono"
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
                    className="w-full px-4 py-3 rounded-xl app-input text-sm transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1.5">CVV</label>
                  <input
                    required
                    type="password"
                    placeholder="•••"
                    value={cardForm.cvv}
                    onChange={(e) =>
                      setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })
                    }
                    maxLength={3}
                    className="w-full px-4 py-3 rounded-xl app-input text-sm transition-colors font-mono"
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
                  className="w-full px-4 py-3 rounded-xl app-input text-sm transition-colors font-mono"
                />
              </div>

              {paymentError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                  {paymentError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 mt-2 btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> Обработка платежа...
                  </>
                ) : (
                  <>
                    <CreditCard size={20} /> Оплатить {formatRub(pricing.totalAmount)} ₽
                  </>
                )}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Нажимая кнопку, вы соглашаетесь с{" "}
                <Link href="#" className="text-blue-600">
                  условиями использования
                </Link>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

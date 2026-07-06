"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import {
  finalCheckoutPrice,
  YEARLY_DISCOUNT_PERCENT,
  type BillingPeriod,
  type PlanId,
} from "@/lib/pricing";

const PLANS: Array<{
  name: string;
  id: PlanId;
  desc: string;
  features: string[];
  cta: string;
  highlight: boolean;
}> = [
  {
    id: "pro",
    name: "Профи",
    desc: "Для активных участников",
    features: [
      "Все регионы России",
      "Неограниченные документы",
      "Email уведомления",
      "Детальный gap-анализ",
      "Карта роста компании",
      "Оценка маржи по прайсу",
      "Проверка национального режима",
    ],
    cta: "Начать 7 дней бесплатно",
    highlight: true,
  },
  {
    id: "team",
    name: "Команда",
    desc: "Для компаний с командой",
    features: [
      "Всё из Профи",
      "До 5 пользователей",
      "Персональный онбординг команды",
      "Приоритетная поддержка",
      "Личный менеджер",
    ],
    cta: "Связаться",
    highlight: false,
  },
];

export default function LandingPricing() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  return (
    <>
      <div className="flex justify-center mb-10">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
          <button
            type="button"
            onClick={() => setBillingPeriod("monthly")}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              billingPeriod === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Помесячно
          </button>
          <button
            type="button"
            onClick={() => setBillingPeriod("yearly")}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              billingPeriod === "yearly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            На год
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
              −{YEARLY_DISCOUNT_PERCENT}%
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {PLANS.map((plan) => {
          const p = finalCheckoutPrice(plan.id, billingPeriod, 0);
          return (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 border card-hover app-card ${
                plan.highlight
                  ? "border-emerald-400 relative bg-gradient-to-br from-emerald-50 to-blue-50"
                  : "border-slate-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-slate-900 btn-primary">
                  Популярный
                </div>
              )}
              <h3 className="text-lg font-semibold text-slate-900 mb-1">{plan.name}</h3>
              <p className="text-slate-600 text-sm mb-4">{plan.desc}</p>
              <div className="mb-6">
                {billingPeriod === "yearly" ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-slate-900">
                        {p.totalAmount.toLocaleString("ru-RU")}
                      </span>
                      <span className="text-slate-600">₽/год</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      ≈ {p.perMonthEquivalent.toLocaleString("ru-RU")} ₽/мес
                    </p>
                  </>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900">
                      {p.totalAmount.toLocaleString("ru-RU")}
                    </span>
                    <span className="text-slate-600">₽/мес</span>
                  </div>
                )}
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className={`block text-center py-3 rounded-xl font-medium transition-all text-sm ${
                  plan.highlight
                    ? "text-white hover:opacity-90"
                    : "border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
                style={plan.highlight ? { background: "linear-gradient(135deg, #3b82f6, #10b981)" } : {}}
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

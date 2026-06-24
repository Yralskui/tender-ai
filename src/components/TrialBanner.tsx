"use client";
import Link from "next/link";
import { Clock, Zap, X } from "lucide-react";
import { useState } from "react";

interface Props {
  daysLeft: number;
  type: "trial" | "paid";
  plan?: string | null;
}

export default function TrialBanner({ daysLeft, type, plan }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (type === "paid" || dismissed) return null;

  const isUrgent = daysLeft <= 2;
  const isWarning = daysLeft <= 4;

  return (
    <div
      className={`rounded-xl px-5 py-3 mb-6 flex items-center justify-between border ${
        isUrgent
          ? "border-red-200 alert-error"
          : isWarning
          ? "border-amber-200 alert-warning"
          : "border-blue-200 alert-info"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isUrgent ? "bg-red-100" : isWarning ? "bg-amber-100" : "bg-blue-100"
          }`}
        >
          <Clock
            size={16}
            className={isUrgent ? "text-red-600" : isWarning ? "text-amber-600" : "text-blue-600"}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">
            {isUrgent
              ? `Осталось ${daysLeft} ${daysLeft === 1 ? "день" : "дня"} бесплатного периода!`
              : `Пробный период: осталось ${daysLeft} дней`}
          </p>
          <p className="text-xs text-slate-600">
            {isUrgent
              ? "После истечения доступ будет заблокирован — выберите тариф сейчас"
              : "Полный доступ ко всем функциям платформы"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Link href="/paywall" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white btn-primary transition-all">
          <Zap size={14} />
          Выбрать тариф
        </Link>
        {!isUrgent && (
          <button onClick={() => setDismissed(true)} className="text-slate-600 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

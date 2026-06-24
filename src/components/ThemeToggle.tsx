"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";

interface Props {
  compact?: boolean;
}

export default function ThemeToggle({ compact = false }: Props) {
  const { theme, setTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <div
        className={`rounded-xl bg-slate-100 animate-pulse ${compact ? "h-9 w-[88px]" : "h-11 w-full max-w-xs"}`}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 ${compact ? "" : "w-full max-w-xs"}`}
      role="group"
      aria-label="Тема оформления"
    >
      {(["light", "dark"] as Theme[]).map((value) => {
        const active = theme === value;
        const Icon = value === "light" ? Sun : Moon;
        const label = value === "light" ? "Светлая" : "Тёмная";

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
            aria-pressed={active}
          >
            <Icon size={16} />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}

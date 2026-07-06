"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  DEFAULT_FEED_FILTERS,
  EXCLUDE_KEYWORD_PRESETS,
  INCLUDE_KEYWORD_PRESETS,
  PRICE_PRESET_OPTIONS,
  feedFiltersActive,
  formatPriceFilterLabel,
  matchPricePresetId,
  parseFeedFilters,
  serializeFeedFilters,
  type FeedDeadlineFilter,
  type FeedSortMode,
} from "@/lib/tenderFeedFilters";

const SORT_OPTIONS: { value: FeedSortMode; label: string }[] = [
  { value: "score", label: "По совпадению" },
  { value: "deadline", label: "Срок скоро истекает" },
  { value: "new", label: "Сначала новые" },
];

const DEADLINE_OPTIONS: { value: FeedDeadlineFilter; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "1d", label: "≤ 1 день" },
  { value: "3d", label: "≤ 3 дня" },
  { value: "7d", label: "≤ 7 дней" },
];

export default function TenderFeedFilters({ view }: { view: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const filters = useMemo(
    () =>
      parseFeedFilters({
        sort: searchParams.get("sort"),
        deadline: searchParams.get("deadline"),
        include: searchParams.get("include"),
        exclude: searchParams.get("exclude"),
        priceMin: searchParams.get("priceMin"),
        priceMax: searchParams.get("priceMax"),
      }),
    [searchParams]
  );

  const [includeDraft, setIncludeDraft] = useState(filters.includeWords.join(", "));
  const [excludeDraft, setExcludeDraft] = useState(filters.excludeWords.join(", "));
  const [priceMinDraft, setPriceMinDraft] = useState(
    filters.priceMin != null ? String(filters.priceMin) : ""
  );
  const [priceMaxDraft, setPriceMaxDraft] = useState(
    filters.priceMax != null ? String(filters.priceMax) : ""
  );
  const pricePreset = matchPricePresetId(filters.priceMin, filters.priceMax);

  const isTagged = view === "tagged" || Boolean(searchParams.get("tag"));
  const active = feedFiltersActive(filters);

  useEffect(() => {
    setIncludeDraft(filters.includeWords.join(", "));
    setExcludeDraft(filters.excludeWords.join(", "));
    setPriceMinDraft(filters.priceMin != null ? String(filters.priceMin) : "");
    setPriceMaxDraft(filters.priceMax != null ? String(filters.priceMax) : "");
  }, [filters.includeWords, filters.excludeWords, filters.priceMin, filters.priceMax]);

  const pushFilters = useCallback(
    (next: Partial<typeof filters> & { includeWords?: string[]; excludeWords?: string[] }) => {
      const merged = {
        ...filters,
        ...next,
      };
      const params = new URLSearchParams();
      params.set("view", view);
      const tag = searchParams.get("tag");
      if (tag) params.set("tag", tag);
      const q = searchParams.get("q");
      if (q) params.set("q", q);
      for (const [k, v] of Object.entries(serializeFeedFilters(merged))) {
        params.set(k, v);
      }
      startTransition(() => router.push(`/tenders?${params.toString()}`));
    },
    [filters, router, searchParams, view]
  );

  function resetFilters() {
    setIncludeDraft("");
    setExcludeDraft("");
    setPriceMinDraft("");
    setPriceMaxDraft("");
    const params = new URLSearchParams();
    params.set("view", view);
    const tag = searchParams.get("tag");
    if (tag) params.set("tag", tag);
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    startTransition(() => router.push(`/tenders?${params.toString()}`));
  }

  function togglePreset(word: string, kind: "include" | "exclude") {
    if (kind === "include") {
      const set = new Set(filters.includeWords);
      if (set.has(word)) set.delete(word);
      else set.add(word);
      const includeWords = [...set];
      setIncludeDraft(includeWords.join(", "));
      pushFilters({ includeWords });
    } else {
      const set = new Set(filters.excludeWords);
      if (set.has(word)) set.delete(word);
      else set.add(word);
      const excludeWords = [...set];
      setExcludeDraft(excludeWords.join(", "));
      pushFilters({ excludeWords });
    }
  }

  function applyKeywordDraft() {
    const includeWords = includeDraft
      .split(/[,;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2);
    const excludeWords = excludeDraft
      .split(/[,;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2);
    pushFilters({ includeWords: [...new Set(includeWords)], excludeWords: [...new Set(excludeWords)] });
  }

  function applyCustomPrice() {
    const parse = (raw: string) => {
      const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    let priceMin = priceMinDraft.trim() ? parse(priceMinDraft) : null;
    let priceMax = priceMaxDraft.trim() ? parse(priceMaxDraft) : null;
    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      [priceMin, priceMax] = [priceMax, priceMin];
    }
    pushFilters({ priceMin, priceMax });
  }

  function onPricePresetChange(presetId: string) {
    const preset = PRICE_PRESET_OPTIONS.find((p) => p.id === presetId);
    if (!preset || presetId === "custom") return;
    setPriceMinDraft(preset.min != null ? String(preset.min) : "");
    setPriceMaxDraft(preset.max != null ? String(preset.max) : "");
    pushFilters({ priceMin: preset.min, priceMax: preset.max });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
            active || open
              ? "bg-slate-100 border-slate-300 text-slate-800"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Filter size={13} />
          Фильтры
          {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </button>

        <select
          value={filters.sort}
          disabled={pending}
          onChange={(e) => pushFilters({ sort: e.target.value as FeedSortMode })}
          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700"
          aria-label="Сортировка"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={filters.deadline}
          disabled={pending}
          onChange={(e) => pushFilters({ deadline: e.target.value as FeedDeadlineFilter })}
          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700"
          aria-label="Срок подачи"
        >
          {DEADLINE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {isTagged && o.value === "active" ? "Все с меткой" : o.label}
            </option>
          ))}
        </select>

        <select
          value={pricePreset}
          disabled={pending}
          onChange={(e) => onPricePresetChange(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 max-w-[140px]"
          aria-label="НМЦК"
          title={formatPriceFilterLabel(filters.priceMin, filters.priceMax)}
        >
          {PRICE_PRESET_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {pricePreset === "custom" && (
            <option value="custom">{formatPriceFilterLabel(filters.priceMin, filters.priceMax)}</option>
          )}
        </select>

        {active && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <X size={12} /> Сбросить
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3 max-w-3xl">
          <div>
            <div className="text-[11px] font-medium text-slate-600 mb-1.5">НМЦК (свой диапазон, ₽)</div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-[11px] text-slate-500">
                от
                <input
                  value={priceMinDraft}
                  onChange={(e) => setPriceMinDraft(e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                  className="block mt-0.5 w-28 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                />
              </label>
              <label className="text-[11px] text-slate-500">
                до
                <input
                  value={priceMaxDraft}
                  onChange={(e) => setPriceMaxDraft(e.target.value)}
                  placeholder="1000000"
                  inputMode="numeric"
                  className="block mt-0.5 w-28 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                />
              </label>
              <button
                type="button"
                onClick={applyCustomPrice}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                Применить цену
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-600 mb-1.5">В названии должно быть</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {INCLUDE_KEYWORD_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => togglePreset(w, "include")}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    filters.includeWords.includes(w)
                      ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:bg-white"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <input
              value={includeDraft}
              onChange={(e) => setIncludeDraft(e.target.value)}
              placeholder="марля, шапоч, халат — через запятую"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            />
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-600 mb-1.5">Исключить из названия</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {EXCLUDE_KEYWORD_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => togglePreset(w, "exclude")}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    filters.excludeWords.includes(w)
                      ? "bg-red-100 border-red-300 text-red-800"
                      : "border-slate-200 text-slate-600 hover:bg-white"
                  }`}
                >
                  −{w}
                </button>
              ))}
            </div>
            <input
              value={excludeDraft}
              onChange={(e) => setExcludeDraft(e.target.value)}
              placeholder="лекарств, препарат — через запятую"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500 leading-snug">
              {isTagged
                ? "В разделе «С метками» показываются все помеченные закупки, в том числе с истёкшим сроком подачи. Без метки просроченные удаляются при синхронизации."
                : "Истёкшие без метки скрыты в основной ленте. Просроченные с меткой — в разделе «С метками»."}
            </p>
            <button
              type="button"
              onClick={applyKeywordDraft}
              disabled={pending}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              Применить слова
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

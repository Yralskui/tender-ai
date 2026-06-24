"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { serializeFeedFilters, parseFeedFilters } from "@/lib/tenderFeedFilters";

export default function TenderFeedSearch({ view }: { view: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") || "";
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function buildHref(nextQ: string) {
    const params = new URLSearchParams();
    params.set("view", view);
    const tag = searchParams.get("tag");
    if (tag) params.set("tag", tag);
    const trimmed = nextQ.trim();
    if (trimmed) params.set("q", trimmed);
    const filters = parseFeedFilters({
      sort: searchParams.get("sort"),
      deadline: searchParams.get("deadline"),
      include: searchParams.get("include"),
      exclude: searchParams.get("exclude"),
      priceMin: searchParams.get("priceMin"),
      priceMax: searchParams.get("priceMax"),
    });
    for (const [k, v] of Object.entries(serializeFeedFilters(filters))) {
      params.set(k, v);
    }
    return `/tenders?${params.toString()}`;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(() => {
      router.push(buildHref(value));
    });
  }

  function clear() {
    setValue("");
    startTransition(() => {
      router.push(buildHref(""));
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex gap-2 max-w-xl">
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Номер аукциона (19 цифр) или название…"
          className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          inputMode="numeric"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            aria-label="Очистить"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 shrink-0"
      >
        Найти
      </button>
    </form>
  );
}

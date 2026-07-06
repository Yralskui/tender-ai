"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TenderFeedCard from "@/components/tender/TenderFeedCard";
import type { TenderFeedCardItem } from "@/lib/tenderFeedTypes";
import { Loader2 } from "lucide-react";

interface Props {
  initialItems: TenderFeedCardItem[];
  initialOffset: number;
  initialHasMore: boolean;
  totalInDb: number;
  feedMode: string;
  tagId?: string;
  searchQuery?: string;
  returnView: string;
  returnHref: string;
  sort?: string;
  deadline?: string;
  include?: string;
  exclude?: string;
  priceMin?: string;
  priceMax?: string;
}

export default function TenderFeedInfiniteList({
  initialItems,
  initialOffset,
  initialHasMore,
  totalInDb,
  feedMode,
  tagId,
  searchQuery,
  returnView,
  returnHref,
  sort,
  deadline,
  include,
  exclude,
  priceMin,
  priceMax,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setOffset(initialOffset);
    setHasMore(initialHasMore);
    setError(null);
  }, [initialItems, initialOffset, initialHasMore, feedMode, tagId, searchQuery, sort, deadline, include, exclude, priceMin, priceMax]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("view", feedMode);
      params.set("offset", String(offset));
      params.set("limit", "40");
      if (tagId) params.set("tag", tagId);
      if (searchQuery) params.set("q", searchQuery);
      if (sort) params.set("sort", sort);
      if (deadline) params.set("deadline", deadline);
      if (include) params.set("include", include);
      if (exclude) params.set("exclude", exclude);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);

      const res = await fetch(`/api/tenders/feed?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError("Не удалось подгрузить");
        return;
      }

      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = (data.items as TenderFeedCardItem[]).filter((i) => !seen.has(i.id));
        return [...prev, ...next];
      });
      setOffset(data.nextOffset ?? offset);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, offset, feedMode, tagId, searchQuery, sort, deadline, include, exclude, priceMin, priceMax]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-2.5 max-w-5xl">
        {items.map((tender) => (
          <TenderFeedCard
            key={tender.id}
            id={tender.id}
            externalId={tender.externalId}
            title={tender.title}
            customerName={tender.customerName}
            region={tender.region}
            category={tender.category}
            price={tender.price}
            deadline={new Date(tender.deadline)}
            displayScore={tender.displayScore}
            hasCatalog={tender.hasCatalog}
            ruMatched={tender.ruMatched}
            ruPartial={tender.ruPartial}
            ruTotal={tender.ruTotal}
            isEis={tender.isEis}
            hasTzFile={tender.hasTzFile}
            returnView={returnView}
            returnHref={returnHref}
            labelNames={tender.labelNames}
            labelColors={tender.labelColors}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="max-w-5xl py-6 flex flex-col items-center gap-2">
        {loading && (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Загружаем ещё…
          </span>
        )}
        {error && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-sm text-blue-600 hover:underline"
          >
            {error} — повторить
          </button>
        )}
        {!hasMore && items.length > 0 && (
          <p className="text-xs text-slate-400">
            Показано {items.length}
            {totalInDb > items.length ? ` из ${totalInDb} в базе` : ""}
          </p>
        )}
        {hasMore && !loading && !error && (
          <p className="text-xs text-slate-400">
            Листайте вниз — подгрузим ещё ({items.length} из {totalInDb})
          </p>
        )}
      </div>
    </>
  );
}

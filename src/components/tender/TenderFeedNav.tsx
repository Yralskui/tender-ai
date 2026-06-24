"use client";

import { useEffect } from "react";
import {
  TENDER_FEED_RETURN_KEY,
  TENDER_FEED_SCROLL_KEY,
} from "@/lib/tenderFeedReturn";

export { saveTenderFeedReturnState } from "@/lib/tenderFeedReturn";

/** Сохраняет позицию скролла и URL ленты при уходе в карточку */
export function saveTenderFeedScroll(returnHref: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TENDER_FEED_SCROLL_KEY, String(window.scrollY));
  sessionStorage.setItem(TENDER_FEED_RETURN_KEY, returnHref);
}

export function TenderFeedScrollRestore({ returnHref }: { returnHref: string }) {
  useEffect(() => {
    const savedReturn = sessionStorage.getItem(TENDER_FEED_RETURN_KEY);
    const savedY = sessionStorage.getItem(TENDER_FEED_SCROLL_KEY);
    if (savedReturn === returnHref && savedY) {
      const y = parseInt(savedY, 10);
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
      sessionStorage.removeItem(TENDER_FEED_SCROLL_KEY);
    }
  }, [returnHref]);

  return null;
}

/** Авто-разбор ТЗ и подгрузка новых закупок с ЕИС (с задержкой, чтобы не мешать ленте) */
export function BackgroundTzEnrichment() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/tenders/enrich-tz", { method: "POST" }).catch(() => {});
      void fetch("/api/tenders/auto-sync", { method: "POST" }).catch(() => {});
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

/** Ожидание первичного кэша совпадений — перезагрузка ленты когда готово */
export function FeedCachePoller({
  active,
  feedMode,
}: {
  active: boolean;
  feedMode: string;
}) {
  useEffect(() => {
    if (!active || (feedMode !== "matched" && feedMode !== "profile")) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/tenders/feed-cache");
        const data = await res.json();
        if (cancelled) return;
        const ready =
          !data.rebuilding &&
          (feedMode === "matched" ? data.matchedCount > 0 : data.profileCount > 0);
        if (ready) {
          window.location.reload();
          return;
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        window.setTimeout(() => void poll(), 3000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [active, feedMode]);

  return null;
}

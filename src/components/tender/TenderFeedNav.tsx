"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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

/** Разбор ТЗ — только на сервере (планировщик). Клиент не запускает тяжёлые POST. */
export function BackgroundTzEnrichment() {
  return null;
}

const POLL_MS = 10_000;
const MAX_POLLS = 36;

/** Ожидание первичного кэша — мягкое обновление без бесконечных полных перезагрузок */
export function FeedCachePoller({
  active,
  feedMode,
}: {
  active: boolean;
  feedMode: string;
}) {
  const router = useRouter();
  const pollsRef = useRef(0);

  useEffect(() => {
    if (!active || (feedMode !== "matched" && feedMode !== "profile")) return;

    pollsRef.current = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || pollsRef.current >= MAX_POLLS) return;
      pollsRef.current += 1;

      try {
        const res = await fetch("/api/tenders/feed-cache");
        const data = await res.json();
        if (cancelled) return;
        const ready =
          !data.rebuilding &&
          (feedMode === "matched" ? data.matchedCount > 0 : data.profileCount > 0);
        if (ready) {
          router.refresh();
          return;
        }
      } catch {
        // ignore
      }

      if (!cancelled && pollsRef.current < MAX_POLLS) {
        timer = setTimeout(() => void poll(), POLL_MS);
      }
    };

    timer = setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, feedMode, router]);

  return null;
}

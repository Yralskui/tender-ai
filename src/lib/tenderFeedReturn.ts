/**
 * Возврат с карточки тендера на ленту с сохранением фильтров.
 */

import { parseFeedFilters, serializeFeedFilters } from "@/lib/tenderFeedFilters";

export const TENDER_FEED_SCROLL_KEY = "tender-feed-scroll";
export const TENDER_FEED_RETURN_KEY = "tender-feed-return-url";

export function buildTendersFeedReturnHref(params: {
  view: string;
  tag?: string;
  q?: string;
  sort?: string;
  deadline?: string;
  include?: string;
  exclude?: string;
  priceMin?: string;
  priceMax?: string;
}): string {
  const sp = new URLSearchParams();
  sp.set("view", params.view);
  if (params.tag) sp.set("tag", params.tag);
  if (params.q?.trim()) sp.set("q", params.q.trim());

  const filters = parseFeedFilters({
    sort: params.sort,
    deadline: params.deadline,
    include: params.include,
    exclude: params.exclude,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
  });
  for (const [k, v] of Object.entries(serializeFeedFilters(filters))) {
    sp.set(k, v);
  }

  return `/tenders?${sp.toString()}`;
}

export function sanitizeTendersReturnTo(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!decoded.startsWith("/tenders")) return null;
    if (decoded.includes("://") || decoded.startsWith("//")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function resolveTendersBackHref(returnTo?: string | null, fromView?: string | null): string {
  const safe = sanitizeTendersReturnTo(returnTo);
  if (safe) return safe;

  const view =
    fromView === "catalog" ||
    fromView === "profile" ||
    fromView === "matched" ||
    fromView === "tagged"
      ? fromView
      : "matched";

  return `/tenders?view=${view}`;
}

export function saveTenderFeedReturnState(returnHref: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TENDER_FEED_SCROLL_KEY, String(window.scrollY));
  sessionStorage.setItem(TENDER_FEED_RETURN_KEY, returnHref);
}

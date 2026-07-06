import type { PageFeedMode } from "@/lib/tenderFeedTypes";

/** Ссылки на вкладки ленты без «залипшего» tag= из меток */
export function tendersViewHref(view: PageFeedMode | "matched" | "profile" | "catalog"): string {
  return `/tenders?view=${view}`;
}

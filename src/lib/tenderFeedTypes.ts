/** Типы ленты тендеров — без серверных зависимостей (client-safe). */

export interface TenderFeedCardItem {
  id: string;
  externalId: string;
  title: string;
  customerName: string;
  region: string;
  category: string;
  price: number;
  deadline: string;
  displayScore: number | null;
  hasCatalog: boolean;
  ruMatched: number;
  ruPartial: number;
  ruTotal: number;
  isEis: boolean;
  hasTzFile: boolean;
  labelNames: string[];
  labelColors: string[];
}

export type PageFeedMode = "matched" | "profile" | "catalog" | "tagged";

export interface TenderFeedPageResult {
  items: TenderFeedCardItem[];
  nextOffset: number;
  hasMore: boolean;
  totalInDb: number;
  statsShown: number;
  statsHiddenNoRu?: number;
  cacheBuilding?: boolean;
  cacheMatchedCount?: number;
  /** В режиме меток — сколько закупок в текущей выборке (все / одна метка) */
  taggedTotal?: number;
}

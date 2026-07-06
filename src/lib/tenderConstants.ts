/**
 * Константы запросов к тендерам — без серверных зависимостей (безопасно для client components).
 */

import type { Prisma } from "@/generated/prisma/client";

/** Индексируемый фильтр — без CONTAINS по JSON */
export const REAL_EIS_TENDER_WHERE: Prisma.TenderWhereInput = {
  status: "active",
  importedFromEis: true,
};

/** Поля для ленты — без лишних колонок */
export const TENDER_FEED_SELECT = {
  id: true,
  externalId: true,
  title: true,
  customerName: true,
  region: true,
  price: true,
  publishedAt: true,
  deadline: true,
  category: true,
  okvedCode: true,
  requirements: true,
  updatedAt: true,
} as const;

/** Сколько последних закупок ранжируем (полный analyzeMatch только на карточке тендера) */
export const TENDER_RANK_POOL = {
  dashboard: 100,
  matched: 200,
  profile: 250,
  catalog: 200,
} as const;

/** Карточек на экран / за один запрос подгрузки */
export const TENDER_FEED_PAGE_SIZE = 40;

/** Сколько строк из БД читаем за один проход (matched/profile) */
export const TENDER_FEED_SCAN_BATCH = 300;

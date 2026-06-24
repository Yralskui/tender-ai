/**
 * Извлечение номенклатуры из приложения к РУ (ФСР/РЗН).
 * Типичный формат: «1. Халат хирургический … длина 120-140, 1 шт.»
 */

import {
  structuredItemFromRuLine,
  buildCatalogDisplayText,
  type StructuredCatalogItem,
} from "./productDimensions";

export type { StructuredCatalogItem };

const SKIP_LINE =
  /^(лист\s+\d|приложени|регистрационн|удостоверен|федеральн|служб|заместитель|росздрав|№\s*фср|м\.?\s*п\.?|подпись|\d{7}$)/i;

const PRODUCT_SIGNAL =
  /халат|бель[её]|простын|наволоч|салфет|бахил|хирург|комплект|рулон|фартук|майка|колпач|шапоч|пеленк|пелёнк|покрывал|салфет|мешок|чехол|сорочк|костюм|туалет|одежд|салфетк|марл|фартук/i;

function normalizeRuProductLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(\d+\s*(?:шт|пар|рулон)\.?)\s*$/i, "")
    .trim();
}

/** Строка — позиция из приложения, а не служебный текст */
function looksLikeRuAnnexProduct(line: string): boolean {
  if (line.length < 12 || line.length > 240) return false;
  if (SKIP_LINE.test(line)) return false;
  if (!PRODUCT_SIGNAL.test(line)) return false;
  if (/^длина\s+\d/i.test(line) && !PRODUCT_SIGNAL.test(line.slice(0, 30))) return false;
  return true;
}

/**
 * Парсит нумерованные строки приложения к РУ.
 * Сохраняет размеры: «длина 70-320, ширина 70-160».
 */
export function extractRuAnnexProducts(text: string): string[] {
  if (!text || text.length < 80) return [];

  const isAnnex =
    /приложени.*регистрационн|регистрационн.*удостоверен.*медицинск/i.test(text) ||
    /№\s*фср\s*\d{4}/i.test(text);

  if (!isAnnex && !/наименование.*медицинск/i.test(text)) {
    return [];
  }

  const out: string[] = [];
  const lines = text.replace(/\r/g, "").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 10) continue;

    const numbered = line.match(/^(?:\d+|[IVXLCА-ЯЁ]{1,5})\.\s+(.+)$/i);
    if (!numbered) continue;

    let body = numbered[1].trim();
    body = body.replace(/\s*;\s*$/, "");

    if (!looksLikeRuAnnexProduct(body)) continue;

    const normalized = normalizeRuProductLine(body);
    if (normalized.length >= 10) out.push(normalized);
  }

  return [...new Set(out)].slice(0, 80);
}

/** Структурированный каталог: имя + размеры в мм для сверки с ТЗ. */
export function extractRuCatalogItems(text: string): StructuredCatalogItem[] {
  const lines = extractRuAnnexProducts(text);
  const items = lines.map(structuredItemFromRuLine);
  const seen = new Set<string>();
  const unique: StructuredCatalogItem[] = [];
  for (const item of items) {
    const key = item.rawText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function mergeRuCatalogItems(
  existing: StructuredCatalogItem[],
  annexText: string
): StructuredCatalogItem[] {
  const annex = extractRuCatalogItems(annexText);
  if (annex.length === 0) return existing;

  const merged = [...existing];
  const keys = new Set(existing.map((p) => p.rawText.toLowerCase()));

  for (const item of annex) {
    const key = item.rawText.toLowerCase();
    if (!keys.has(key)) {
      merged.push(item);
      keys.add(key);
    }
  }
  return merged;
}

export function mergeRuCatalogProducts(existing: string[], annexText: string): string[] {
  const annex = extractRuAnnexProducts(annexText);
  if (annex.length === 0) return existing;

  const merged = [...existing];
  const existingLower = new Set(existing.map((p) => p.toLowerCase()));

  for (const p of annex) {
    const key = p.toLowerCase();
    if (!existingLower.has(key)) {
      merged.push(p);
      existingLower.add(key);
    }
  }

  return merged;
}

/** Строки для отображения: с размерами в мм, если есть структура. */
export function catalogItemsToDisplayStrings(items: StructuredCatalogItem[]): string[] {
  return items.map((i) => i.displayText || buildCatalogDisplayText(i.name, i.dimensions));
}

/**
 * Извлечение номенклатуры из приложения к РУ (ФСР/РЗН).
 */

import {
  structuredItemFromRuLine,
  buildCatalogDisplayText,
  type StructuredCatalogItem,
} from "./productDimensions";

export type { StructuredCatalogItem };

const SKIP_LINE =
  /^(лист\s+\d|приложени|регистрационн|удостоверен|федеральн|служб|заместитель|росздрав|№\s*фср|м\.?\s*п\.?|подпись|\d{7}$|--\s*\d+\s+of)/i;

const PRODUCT_SIGNAL =
  /халат|бель[её]|простын|наволоч|салфет|бахил|хирург|комплект|рулон|фартук|майка|колпач|шапоч|берет|берёт|пеленк|пелёнк|покрывал|сорочк|костюм|туалет|одежд|марл|чехол|мешок|плёнк|пленк|покрыти|перчат|маск|калоп/i;

function splitTableLikeLine(line: string): string[] {
  return line
    .split(/\s{2,}|\t/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 8);
}

function normalizeRuProductLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(\d+\s*(?:шт|пар|рулон)\.?)\s*$/i, "")
    .trim();
}

function looksLikeRuAnnexProduct(line: string): boolean {
  if (line.length < 8 || line.length > 320) return false;
  if (SKIP_LINE.test(line)) return false;
  if (!PRODUCT_SIGNAL.test(line)) return false;
  if (/^длина\s+\d/i.test(line) && !PRODUCT_SIGNAL.test(line.slice(0, 30))) return false;
  return true;
}

function parseNumberedLine(line: string): string | null {
  const numbered = line.match(/^(?:\d+|[IVXLCА-ЯЁ]{1,5})[\.)]\s+(.+)$/i);
  if (!numbered) return null;
  let body = numbered[1].trim().replace(/\s*;\s*$/, "");
  if (!looksLikeRuAnnexProduct(body)) return null;
  return normalizeRuProductLine(body);
}

function parseBulletLine(line: string): string | null {
  const bullet = line.match(/^[-•*]\s+(.+)$/);
  if (!bullet) return null;
  const body = bullet[1].trim();
  if (!looksLikeRuAnnexProduct(body)) return null;
  return normalizeRuProductLine(body);
}

function parsePlainProductLine(line: string): string | null {
  const trimmed = line.trim();
  if (!looksLikeRuAnnexProduct(trimmed)) return null;
  if (/^\d[\d\s.,/-]{5,}$/.test(trimmed)) return null;
  return normalizeRuProductLine(trimmed);
}

function isAnnexContext(text: string): boolean {
  if (text.length > 400 && /медицинск|издели|рзн|фср|простын|комплект|бахил|шапоч/i.test(text)) {
    return true;
  }
  return (
    /приложени.*регистрационн|регистрационн.*удостоверен.*медицинск/i.test(text) ||
    /№\s*фср\s*\d{4}/i.test(text) ||
    /рзн\s*\d{4}/i.test(text) ||
    /наименование.*медицинск/i.test(text) ||
    /перечень.*издели/i.test(text)
  );
}

/** Парсит строки приложения к РУ (нумерованные, маркеры, plain OCR). */
export function extractRuAnnexProducts(text: string): string[] {
  if (!text || text.length < 80) return [];

  const annexCtx = isAnnexContext(text);
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 8) continue;

    const parsed = parseNumberedLine(line) || parseBulletLine(line);
    if (parsed) {
      out.push(parsed);
      continue;
    }

    if (annexCtx) {
      const plain = parsePlainProductLine(line);
      if (plain) {
        out.push(plain);
        continue;
      }
      for (const cell of splitTableLikeLine(line)) {
        const cellParsed = parsePlainProductLine(cell);
        if (cellParsed) out.push(cellParsed);
      }
    }
  }

  return [...new Set(out)].slice(0, 120);
}

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

export function mergeStructuredCatalogItems(...groups: StructuredCatalogItem[][]): StructuredCatalogItem[] {
  const merged: StructuredCatalogItem[] = [];
  const keys = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const key = item.rawText.toLowerCase();
      if (keys.has(key)) continue;
      keys.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export function mergeRuCatalogItems(
  existing: StructuredCatalogItem[],
  annexText: string
): StructuredCatalogItem[] {
  return mergeStructuredCatalogItems(existing, extractRuCatalogItems(annexText));
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

export function catalogItemsToDisplayStrings(items: StructuredCatalogItem[]): string[] {
  return items.map((i) => i.displayText || buildCatalogDisplayText(i.name, i.dimensions));
}

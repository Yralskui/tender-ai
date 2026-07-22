/**
 * Разбор таблиц «Описание объекта закупки» из текста старого .doc (Word 97-2003),
 * извлечённого через word-extractor. В отличие от .docx это не XML с ячейками
 * <w:tc>, а плоский текст, где word-extractor разделяет колонки таблицы табуляцией
 * и строки — переводом строки, напр.:
 *   № п/п\tНаименование объекта закупки\tЕдиница измерения\tКоличество
 *   1\tБахилы п/эт на резинке гладкие\tШтука\t360 000
 */

import { buildDocxParseResult, type KtruProductBlock, type DocxKtruParseResult } from "@/lib/docxTableParser";

const QTY_TOKEN_RE = /^\d{1,3}(?:[\s ]?\d{3})*$/;

function parseQty(cell: string): number | null {
  const t = cell.trim();
  if (!QTY_TOKEN_RE.test(t)) return null;
  const n = parseInt(t.replace(/[\s ]/g, ""), 10);
  return n > 0 ? n : null;
}

function normalizeUnit(cell: string): string {
  return /компл|к-т/i.test(cell) ? "компл" : "шт";
}

function cleanProductName(raw: string): string {
  return raw
    .replace(/\*+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface HeaderCols {
  posIdx: number;
  nameIdx: number;
  unitIdx?: number;
  qtyIdx: number;
}

function findHeaderColumns(rows: string[][]): HeaderCols | null {
  for (const cells of rows) {
    const lower = cells.map((c) => c.toLowerCase());
    const posIdx = lower.findIndex((c) => /№|п\/п/.test(c));
    const nameIdx = lower.findIndex((c) => /наименование/.test(c));
    const qtyIdx = lower.findIndex((c) => /^кол-?во|количество/.test(c.trim()));
    if (posIdx >= 0 && nameIdx >= 0 && qtyIdx >= 0) {
      const unitIdx = lower.findIndex((c) => /единица\s+измерения|ед\.?\s*изм/.test(c));
      return { posIdx, nameIdx, unitIdx: unitIdx >= 0 ? unitIdx : undefined, qtyIdx };
    }
  }
  return null;
}

/** Таблица ООЗ из текста .doc: № п/п | Наименование объекта закупки | Единица измерения | Количество */
export function parseLegacyDocOozTable(text: string): DocxKtruParseResult | null {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c.length > 0));

  const cols = findHeaderColumns(rows);
  if (!cols) return null;

  const blocks: KtruProductBlock[] = [];
  let position = 0;

  for (const cells of rows) {
    const posCell = (cells[cols.posIdx] || "").trim();
    if (!/^\d{1,3}$/.test(posCell)) continue;

    const nameRaw = (cells[cols.nameIdx] || "").trim();
    if (nameRaw.length < 4) continue;

    const qtyCell = cells[cols.qtyIdx] || "";
    const quantity = parseQty(qtyCell);
    const unit = cols.unitIdx != null ? normalizeUnit(cells[cols.unitIdx] || "") : "шт";

    position += 1;
    blocks.push({
      position: String(position),
      name: cleanProductName(nameRaw),
      code: "",
      quantity: quantity ?? undefined,
      unit,
      characteristics: [],
    });
  }

  if (blocks.length === 0) return null;
  return buildDocxParseResult(blocks, "Номенклатура из ООЗ (.doc)");
}

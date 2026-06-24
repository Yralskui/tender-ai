/**
 * Номенклатура из Excel «Обоснование НМЦК» — часто полные названия + КТРУ.
 */

import * as XLSX from "xlsx";
import {
  buildLineVolumesFromNmck,
  deriveBlockVariantName,
} from "@/lib/ktruProductVariants";
import type { KtruProductBlock } from "@/lib/docxTableParser";
import { looksLikeProductName } from "@/lib/tzSanitizer";
import { extractTextFromDocxBuffer, unwrapOfficeArchive } from "@/lib/officeText";
import { isOleXlsBuffer, isXlsxBuffer, readSpreadsheetWorkbook } from "@/lib/excelText";

export interface NmckLineItem {
  position: string;
  name: string;
  ktruCode: string;
  unit: string;
  quantity: string;
}

const KTRU_FULL_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/;

function findKtruInRow(cells: string[]): string {
  for (const c of cells) {
    const m = c.match(KTRU_FULL_RE);
    if (m) return m[1];
  }
  return "";
}

function findNameColumnIndex(headerRow: string[]): number {
  const idx = headerRow.findIndex((c) => /наименование\s+товара|наименование\s*\(/i.test(c));
  return idx >= 0 ? idx : 1;
}

function detectNmckColumns(rows: string[][]): {
  nameCol: number;
  unitCol: number;
  qtyCol: number;
  headerEndRow: number;
} {
  let nameCol = 1;
  let unitCol = 2;
  let qtyCol = -1;
  let headerEndRow = 0;

  for (let ri = 0; ri < Math.min(rows.length, 8); ri++) {
    const cells = rows[ri].map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
    if (cells.some((c) => /наименование\s+товара|наименование\s*\(/i.test(c))) {
      nameCol = findNameColumnIndex(cells);
      headerEndRow = ri;
    }
    for (let i = 0; i < cells.length; i++) {
      if (/^ед\.?\s*изм/i.test(cells[i])) unitCol = i;
      if (/^кол-?во$/i.test(cells[i].trim())) qtyCol = i;
    }
  }

  return { nameCol, unitCol, qtyCol, headerEndRow };
}

function parseQtyFromRow(cells: string[], qtyCol: number, unitCol: number): string {
  if (qtyCol >= 0 && cells[qtyCol]) {
    const q = cells[qtyCol].replace(/\s/g, "");
    if (/^\d+$/.test(q)) return q;
  }
  for (let i = unitCol + 1; i < cells.length; i++) {
    const c = cells[i].replace(/\s/g, "");
    if (/^\d{1,6}$/.test(c) && parseInt(c, 10) > 0) return c;
  }
  return "";
}

function resolveNmckSpreadsheetBuffer(buffer: Buffer): Buffer | null {
  const unwrapped = unwrapOfficeArchive(buffer);
  let data = unwrapped?.buffer ?? buffer;

  if (!isXlsxBuffer(data) && !isOleXlsBuffer(data)) {
    if (data[0] === 0x50 && data[1] === 0x4b) {
      const nested = unwrapOfficeArchive(data);
      if (nested?.format === "xlsx") data = nested.buffer;
    }
    if (!isXlsxBuffer(data) && !isOleXlsBuffer(data)) return null;
  }

  return data;
}

export function parseNmckExcelProducts(buffer: Buffer): NmckLineItem[] {
  const data = resolveNmckSpreadsheetBuffer(buffer);
  if (!data) return [];

  const workbook = readSpreadsheetWorkbook(data);
  if (!workbook) return [];

  try {
    const items: NmckLineItem[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      }) as unknown[][];

      const stringRows = rows.map((row) =>
        row.map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
      );

      const { nameCol, unitCol, qtyCol, headerEndRow } = detectNmckColumns(stringRows);
      let headerFound = headerEndRow > 0;

      for (let ri = headerEndRow + 1; ri < stringRows.length; ri++) {
        const cells = stringRows[ri];
        if (!headerFound && cells.some((c) => /наименование\s+товара|наименование\s*\(/i.test(c))) {
          headerFound = true;
          continue;
        }
        if (!headerFound) continue;

        if (!/^\d{1,3}$/.test(cells[0] || "")) continue;

        const name = cells[nameCol] || cells[1] || "";
        const ktru = findKtruInRow(cells);
        if (!name || name.length < 6) continue;
        if (!looksLikeProductName(name) && name.length < 12) continue;
        if (/наименование|ед\.?\s*изм|кол-?во|цена|ндс|коэффициент|итого|нмцк|сред/i.test(name)) continue;

        const unit = cells[unitCol] || "";
        const quantity = parseQtyFromRow(cells, qtyCol, unitCol);

        items.push({
          position: cells[0],
          name,
          ktruCode: ktru,
          unit: /штук/i.test(unit) ? "шт" : unit || "шт",
          quantity: quantity || "1",
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

export function nmckItemsToParseResult(
  items: NmckLineItem[],
  variantNamesByPosition: Map<string, string> = new Map()
): {
  products: string[];
  productSpecs: string[];
  ktruCodes: string[];
  technicalAssignment: string;
  tzVolumes: Array<{
    name: string;
    ktruCode: string;
    quantity: number;
    unit: string;
    position: string;
  }>;
} {
  const products: string[] = [];
  const productSpecs: string[] = [];
  const ktruCodes: string[] = [];
  const tzVolumes = buildLineVolumesFromNmck(items, variantNamesByPosition);

  const useOozVariants = variantNamesByPosition.size > 0;

  if (!useOozVariants) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.position}|${item.ktruCode}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const label = `${item.name} (поз. ${item.position})`;
      products.push(label);
      productSpecs.push(`Позиция ТЗ №: ${item.position}`);
      productSpecs.push(`Позиция ТЗ: ${label}`);
      productSpecs.push(`КТРУ: ${item.ktruCode}`);
      ktruCodes.push(item.ktruCode);
    }
  } else {
    for (const vol of tzVolumes) {
      ktruCodes.push(vol.ktruCode);
    }
  }

  const totalQty = tzVolumes.reduce((s, v) => s + v.quantity, 0);
  if (totalQty > 0) {
    productSpecs.push(
      `Объём закупки: всего ${totalQty} ${tzVolumes[0]?.unit || "шт"} (${tzVolumes.length} строк НМЦК)`
    );
  }

  return {
    products,
    productSpecs,
    ktruCodes: [...new Set(ktruCodes)],
    tzVolumes,
    technicalAssignment: `Опись из обоснования НМЦК: ${items.length} строк${totalQty > 0 ? `, всего ${totalQty} ${tzVolumes[0]?.unit || "шт"}` : ""}`,
  };
}

export function isNmckExcelName(name: string): boolean {
  return /нмцк|нмц|обоснован/i.test(name) && /\.xlsx?(?:\.zip)?$/i.test(name);
}

/** DOCX «Обоснование НМЦК» с таблицей: № | Наименование | ед. | кол-во */
export function isNmckJustificationDocxName(name: string): boolean {
  return /обоснован/i.test(name) && /нмцк|начальн.*цен|цены\s+контракта/i.test(name) && /\.docx?(?:\.zip)?$/i.test(name);
}

export function parseNmckDocxProducts(buffer: Buffer): NmckLineItem[] {
  const text = extractTextFromDocxBuffer(buffer);
  if (!text || text.length < 150) return [];

  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const items: NmckLineItem[] = [];

  for (let i = 0; i < lines.length - 3; i++) {
    if (!/^\d{1,3}$/.test(lines[i])) continue;

    const name = lines[i + 1];
    const unit = lines[i + 2];
    const qtyRaw = lines[i + 3];

    if (!name || name.length < 8) continue;
    if (/наименование|ед\.?\s*изм|кол-?во|цена|ндс|коэффициент|итого|нмцк/i.test(name)) continue;
    if (!/^(шт|штук|упак|комплект|набор)/i.test(unit)) continue;

    const qty = qtyRaw.replace(/\s/g, "");
    if (!/^\d+$/.test(qty)) continue;
    if (!looksLikeProductName(name) && !/простын|чехол|халат|салфет|маск|перчат/i.test(name)) continue;

    const ktruNear = lines.slice(Math.max(0, i - 3), i + 8).join(" ");
    const ktru = ktruNear.match(KTRU_FULL_RE)?.[1] || "";

    items.push({
      position: lines[i],
      name,
      ktruCode: ktru,
      unit,
      quantity: qty,
    });
    i += 3;
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.position}|${item.name}|${item.quantity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

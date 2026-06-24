/**
 * Извлечение текста из XLS/XLSX (типичный формат ТЗ на zakupki.gov.ru).
 */

import * as XLSX from "xlsx";
import AdmZip from "adm-zip";

function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).replace(/\s+/g, " ").trim();
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length === 0) return true;
  const joined = cells.join(" ").toLowerCase();
  return (
    /^(№|п\/п|наименование|характеристик|показатель|требуемое|ед\.?\s*изм|значение)/i.test(cells[0]) ||
    /наименование показателей/i.test(joined)
  );
}

/**
 * Собирает плоский текст + пары «характеристика: значение» из всех листов.
 */
export function extractTextFromXlsxBuffer(buffer: Buffer): string | null {
  try {
    const workbook = readSpreadsheetWorkbook(buffer);
    if (!workbook) return null;

    const lines: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      }) as unknown[][];

      for (const row of rows) {
        const cells = row.map(cellString).filter((c) => c.length > 0);
        if (cells.length === 0 || isHeaderRow(cells)) continue;

        if (cells.length >= 2) {
          const name = cells[cells.length - 2];
          const value = cells[cells.length - 1];
          if (
            name.length >= 2 &&
            name.length <= 120 &&
            value.length <= 200 &&
            !/^\d+$/.test(name)
          ) {
            lines.push(`${name}: ${value}`);
          }
        }

        const rowText = cells.join(" ");
        if (rowText.length >= 8 && rowText.length < 500) {
          lines.push(rowText);
        }
      }
    }

    const text = [...new Set(lines)].join("\n");
    return text.length > 80 ? text : null;
  } catch (e) {
    console.error("extractTextFromXlsxBuffer:", e);
    return null;
  }
}

export function isXlsxBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  try {
    const zip = new AdmZip(buffer);
    return Boolean(zip.getEntry("xl/workbook.xml"));
  } catch {
    return false;
  }
}

/** Старый бинарный Excel (.xls), не ZIP-based .xlsx */
export function isOleXlsBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function isHtmlLikeBuffer(buffer: Buffer): boolean {
  const head = buffer.slice(0, 256).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml");
}

/** Читает .xlsx или .xls; битый «zip» и HTML-ошибки zakupki — без исключения */
export function readSpreadsheetWorkbook(buffer: Buffer): XLSX.WorkBook | null {
  if (buffer.length < 8 || isHtmlLikeBuffer(buffer)) return null;

  const tryRead = (data: Buffer): XLSX.WorkBook | null => {
    if (!isXlsxBuffer(data) && !isOleXlsBuffer(data)) return null;
    try {
      return XLSX.read(data, { type: "buffer", cellText: true, raw: false });
    } catch {
      return null;
    }
  };

  return tryRead(buffer);
}

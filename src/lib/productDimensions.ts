/**
 * Размеры изделий: в РУ обычно сантиметры без единицы («длина 120-140»),
 * в ТЗ заказчика — миллиметры («1000 мм», «100×150 мм»).
 * Все сравнения ведём в мм.
 */

export type DimAxis = "length" | "width" | "height";
export type SourceUnit = "cm" | "mm";

export interface DimensionRange {
  minMm: number;
  maxMm: number;
  sourceUnit: SourceUnit;
  /** Как напечатано в документе, напр. «длина 120-140» */
  sourceLabel: string;
}

export interface ProductDimensions {
  length?: DimensionRange;
  width?: DimensionRange;
  height?: DimensionRange;
}

export interface StructuredCatalogItem {
  name: string;
  rawText: string;
  displayText: string;
  dimensions: ProductDimensions;
  quantityText?: string;
}

const AXIS_RU: Record<string, DimAxis> = {
  длина: "length",
  ширина: "width",
  высота: "height",
};

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

function toMm(value: number, unit: SourceUnit): number {
  return unit === "cm" ? Math.round(value * 10) : Math.round(value);
}

function detectUnit(explicit: string | undefined, context: "ru" | "tz"): SourceUnit {
  if (!explicit) return context === "ru" ? "cm" : "mm";
  const u = explicit.toLowerCase();
  if (u === "см" || u === "cm") return "cm";
  return "mm";
}

function makeRange(
  min: number,
  max: number,
  unit: SourceUnit,
  label: string
): DimensionRange {
  const minMm = toMm(Math.min(min, max), unit);
  const maxMm = toMm(Math.max(min, max), unit);
  return { minMm, maxMm, sourceUnit: unit, sourceLabel: label };
}

/** Парсит «длина 120-140, ширина 70» из строки приложения к РУ (см по умолчанию). */
export function parseRuProductDimensions(text: string): ProductDimensions {
  const dims: ProductDimensions = {};
  const re =
    /(длина|ширина|высота)\s+(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?(?:\s*(мм|см|mm|cm))?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const axis = AXIS_RU[m[1].toLowerCase()];
    if (!axis) continue;
    const unit = detectUnit(m[4], "ru");
    const a = parseNumber(m[2]);
    const b = m[3] ? parseNumber(m[3]) : a;
    const label = m[0].trim();
    dims[axis] = makeRange(a, b, unit, label);
  }

  return dims;
}

/** Парсит размеры из характеристики ТЗ (мм по умолчанию). */
export function parseTzDimensions(text: string): ProductDimensions | null {
  const dims: ProductDimensions = {};

  const axisRe =
    /(длина(?:\s+халата)?|ширина|высота)\s*[.:]*\s*(?:≥|>=|не\s+менее\s+)?(\d+(?:[.,]\d+)?)(?:\s*(?:≤|<=|[-–—])\s*(\d+(?:[.,]\d+)?))?\s*(мм|см|mm|cm)?/gi;
  let m: RegExpExecArray | null;
  while ((m = axisRe.exec(text)) !== null) {
    const axis = AXIS_RU[m[1].toLowerCase().replace(/\s+халата$/, "")] || AXIS_RU[m[1].toLowerCase().split(/\s+/)[0]];
    if (!axis) continue;
    const unit = detectUnit(m[4], "tz");
    const a = parseNumber(m[2]);
    const b = m[3] ? parseNumber(m[3]) : a;
    dims[axis] = makeRange(a, b, unit, m[0].trim());
  }

  const geLe = text.match(
    /(?:длина|ширина|высота)[^≥<=]*(?:≥|>=)\s*(\d+(?:[.,]\d+)?)\s*(?:≤|<=)\s*(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?/i
  );
  if (geLe && !dims.length && !dims.width) {
    const axisLabel = geLe[0].toLowerCase();
    const axis = axisLabel.includes("ширин")
      ? "width"
      : axisLabel.includes("высот")
        ? "height"
        : "length";
    const unit = detectUnit(geLe[3], "tz");
    dims[axis] = makeRange(parseNumber(geLe[1]), parseNumber(geLe[2]), unit, geLe[0].trim());
  }

  const sizePair = text.match(
    /(\d+(?:[.,]\d+)?)\s*[×xхX]\s*(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?/i
  );
  if (sizePair && !dims.length && !dims.width) {
    const unit = detectUnit(sizePair[3], "tz");
    const w = parseNumber(sizePair[1]);
    const h = parseNumber(sizePair[2]);
    dims.width = makeRange(w, w, unit, sizePair[0]);
    dims.length = makeRange(h, h, unit, sizePair[0]);
  }

  const mmOnly = text.match(/(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b/i);
  if (mmOnly && Object.keys(dims).length === 0) {
    const v = parseNumber(mmOnly[1]);
    dims.length = makeRange(v, v, "mm", mmOnly[0]);
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

export function formatDimensionMm(range: DimensionRange, axis: DimAxis): string {
  const label = axis === "length" ? "длина" : axis === "width" ? "ширина" : "высота";
  if (range.minMm === range.maxMm) return `${label} ${range.minMm} мм`;
  return `${label} ${range.minMm}–${range.maxMm} мм`;
}

export function formatProductDimensionsMm(dims: ProductDimensions): string {
  const parts: string[] = [];
  if (dims.length) parts.push(formatDimensionMm(dims.length, "length"));
  if (dims.width) parts.push(formatDimensionMm(dims.width, "width"));
  if (dims.height) parts.push(formatDimensionMm(dims.height, "height"));
  return parts.join(", ");
}

/** Название + размеры в мм для отображения и сверки. */
export function buildCatalogDisplayText(name: string, dims: ProductDimensions): string {
  const dimStr = formatProductDimensionsMm(dims);
  return dimStr ? `${name}, ${dimStr}` : name;
}

function valueInRange(valueMm: number, range: DimensionRange): boolean {
  return valueMm >= range.minMm && valueMm <= range.maxMm;
}

function rangesCompatible(requested: DimensionRange, catalog: DimensionRange): boolean {
  return requested.minMm >= catalog.minMm && requested.maxMm <= catalog.maxMm;
}

/**
 * Сверка размеров ТЗ с диапазоном из РУ.
 * ТЗ может требовать одно значение или узкий диапазон; РУ — широкий диапазон в см.
 */
export function compareProductDimensions(
  tzDims: ProductDimensions,
  ruDims: ProductDimensions
): { ok: boolean; partial: boolean; note: string } {
  const axes: DimAxis[] = ["length", "width", "height"];
  const mismatches: string[] = [];
  const matched: string[] = [];
  let checked = 0;

  for (const axis of axes) {
    const tz = tzDims[axis];
    const ru = ruDims[axis];
    if (!tz) continue;
    checked++;
    if (!ru) {
      mismatches.push(`${axis === "length" ? "длина" : axis === "width" ? "ширина" : "высота"} в РУ не указана`);
      continue;
    }

    const tzMid = Math.round((tz.minMm + tz.maxMm) / 2);
    if (tz.minMm === tz.maxMm) {
      if (valueInRange(tzMid, ru)) {
        matched.push(formatDimensionMm(ru, axis));
      } else {
        mismatches.push(
          `ТЗ ${formatDimensionMm(tz, axis)}, в РУ ${formatDimensionMm(ru, axis)}`
        );
      }
    } else if (rangesCompatible(tz, ru)) {
      matched.push(formatDimensionMm(ru, axis));
    } else if (valueInRange(tzMid, ru)) {
      matched.push(formatDimensionMm(ru, axis));
    } else {
      mismatches.push(
        `ТЗ ${formatDimensionMm(tz, axis)}, в РУ ${formatDimensionMm(ru, axis)}`
      );
    }
  }

  if (checked === 0) return { ok: true, partial: false, note: "" };
  if (mismatches.length === 0) {
    return {
      ok: true,
      partial: false,
      note: matched.length ? `Размеры совпадают: ${matched.join("; ")}` : "",
    };
  }
  if (matched.length > 0) {
    return {
      ok: false,
      partial: true,
      note: `Частично по размерам: ${mismatches.join("; ")}`,
    };
  }
  return { ok: false, partial: false, note: mismatches.join("; ") };
}

/** Извлекает короткое имя изделия до первого «длина/ширина». */
export function extractProductName(rawLine: string): string {
  const cut = rawLine.split(/,\s*(?:длина|ширина|высота)\s+/i)[0];
  return cut.replace(/\s+/g, " ").trim();
}

export function structuredItemFromRuLine(rawLine: string): StructuredCatalogItem {
  const name = extractProductName(rawLine);
  const dimensions = parseRuProductDimensions(rawLine);
  const qty = rawLine.match(/,\s*(\d+\s*(?:шт|пар|рулон)\.?)\s*$/i)?.[1];
  return {
    name,
    rawText: rawLine,
    dimensions,
    quantityText: qty,
    displayText: buildCatalogDisplayText(name, dimensions),
  };
}

/**
 * Excel «Описание объекта закупки» в формате заявки на медтекстиль:
 * «1 14.12.30.190-… Наименование … Характеристики по КТРУ Штука 7000»
 */

import { buildDocxParseResult, type KtruProductBlock } from "@/lib/docxTableParser";
import { extractTextFromXlsxBuffer } from "@/lib/excelText";
import { normalizeTzSpecText } from "@/lib/textNormalize";
import { isPlaceholderPositionName, looksLikeProductName } from "@/lib/tzSanitizer";
import type { DocumentParseResult } from "@/lib/tzDocumentParse";

const POSITION_HEAD_RE =
  /(\d{1,2})\s+(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\s+([А-Яа-яЁё][^\n]{8,160}?)\s+\d+\s+Характеристики по КТРУ\s+Штука\s+(\d{1,7})(?:\s|$)/gi;

const SKIP_LINE_RE =
  /^(главному врачу|заявка на закупку|дополнительные характеристики|нестерильн|описание|участник указывает|значение характеристики не может)/i;

function parseQty(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeRangeText(text: string): string {
  return text.replace(/>\s*=/g, "≥").replace(/<\s*=/g, "≤");
}

function parseCharacteristicLine(line: string): { name: string; value: string } | null {
  let t = normalizeTzSpecText(line).trim();
  t = normalizeRangeText(t);
  if (t.length < 4 || SKIP_LINE_RE.test(t)) return null;
  t = t.split(/\s*\*/)[0].trim();
  t = t.replace(/\s+Значение характеристики[\s\S]*$/i, "").trim();
  t = t.replace(/\s+Участник указывает[\s\S]*$/i, "").trim();
  if (!t || /участник указывает|значение характеристики не может/i.test(t)) return null;

  const colon = t.match(/^([^:]{2,80}):\s*(.+)$/);
  if (colon && !/^(см|мкм|г\/м2|шт)$/i.test(colon[1].trim())) {
    const val = colon[2].trim();
    if (val && !/значение характеристики|участник указывает/i.test(val)) {
      return { name: colon[1].trim(), value: val };
    }
    if (/спанбонд|полиэтилен/i.test(colon[1])) {
      return { name: "материал изготовления", value: colon[1].trim().replace(/:$/, "") };
    }
  }

  const unitOnly = t.match(/^(см|мкм|г\/м2|шт):\s*(.+)$/i);
  if (unitOnly) return null;

  const col = t.match(/^кол\s+(.+)$/i);
  if (col) {
    const rest = col[1].trim();
    const rangeAt = rest.search(/\s[≥<=]/);
    if (rangeAt > 0) {
      return { name: rest.slice(0, rangeAt).trim(), value: rest.slice(rangeAt).trim() };
    }
    if (/[≥<=]/.test(rest)) {
      const m = rest.match(/^(.+?)\s*([≥<=].+)$/);
      if (m) return { name: m[1].trim(), value: m[2].trim() };
    }
    return { name: "количество", value: rest };
  }

  const qual = t.match(/^кач\s+(.+)$/i);
  if (qual) {
    const rest = qual[1].trim();
    const width = rest.match(/^ширина\s+([≥<=].+)$/i);
    if (width) return { name: "ширина", value: width[1].trim() };
    const known = rest.match(
      /^(тип|материал изготовления|исполнение|Особенность упаковки)\s+(.+)$/i
    );
    if (known) return { name: known[1], value: known[2].trim() };
    return { name: "качество", value: rest };
  }

  if (/спанбонд|полиэтилен/i.test(t) && t.length < 80) {
    return { name: "материал изготовления", value: t };
  }

  return null;
}

export function parseMedicalTextileOozText(text: string): DocumentParseResult | null {
  if (!/заявка на закупку|характеристики по ктру/i.test(text)) return null;

  const normalized = text.replace(/\r/g, "\n");
  const heads = [...normalized.matchAll(POSITION_HEAD_RE)];
  if (heads.length === 0) return null;

  const blocks: KtruProductBlock[] = [];

  for (let i = 0; i < heads.length; i++) {
    const m = heads[i];
    const position = m[1];
    const ktru = m[2];
    const name = m[3].replace(/\s+/g, " ").trim();
    const quantity = parseQty(m[4]);
    const bodyStart = m.index! + m[0].length;
    const bodyEnd = heads[i + 1]?.index ?? normalized.length;
    const body = normalized.slice(bodyStart, bodyEnd);

    const characteristics: Array<{ name: string; value: string }> = [];
    const seen = new Set<string>();

    const segments = body
      .split(/\n|(?=\s*(?:кач|кол)\s+)/i)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const rawLine of segments) {
      const line = rawLine.trim();
      if (!line) continue;
      const ch = parseCharacteristicLine(line);
      if (!ch) continue;
      const key = `${ch.name}|${ch.value}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      characteristics.push(ch);
    }

    if (!looksLikeProductName(name) && isPlaceholderPositionName(name)) continue;

    blocks.push({
      position,
      name,
      code: ktru,
      quantity: quantity || undefined,
      unit: "шт",
      characteristics,
    });
  }

  if (blocks.length === 0) return null;

  const built = buildDocxParseResult(blocks, "Заявка на закупку медтекстиля (Excel)");
  return {
    ...built,
    hasRuRequirement: true,
    quality: Math.min(100, 60 + blocks.length * 8 + built.productSpecs.length / 3),
    source: "xlsx-nmck",
  };
}

export function parseMedicalTextileOozXlsx(buffer: Buffer): DocumentParseResult | null {
  const text = extractTextFromXlsxBuffer(buffer);
  if (!text || text.length < 80) return null;
  return parseMedicalTextileOozText(text);
}

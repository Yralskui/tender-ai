/**
 * Парсинг характеристик из текста ТЗ (DOCX/PDF «Описание объекта закупки»).
 */
import { sanitizeTzParseResult } from "@/lib/tzSanitizer";
import { isCharacteristicFieldName, looksLikeProductName, isGenericProcurementTitle } from "@/lib/tzSanitizer";
import { normalizeTzSpecText } from "@/lib/textNormalize";
import type { KtruProductBlock } from "@/lib/docxTableParser";

export interface TzParseResult {
  products: string[];
  productSpecs: string[];
  technicalAssignment: string;
  ktruCodes: string[];
  hasRuRequirement: boolean;
  tzVolumes?: Array<{
    name: string;
    ktruCode?: string;
    quantity: number;
    unit: string;
    position?: string;
  }>;
  productBlocks?: KtruProductBlock[];
}

const VALUE_STARTERS =
  /^(Больше или равно|Меньше или равно|не менее|не более|наличие|отсутствие|соответствие|в соответствии)/i;

const NOISE_PHRASES = [
  /значение характеристики не может изменяться/i,
  /участник закупки указывает в заявке/i,
  /инструкция по заполнению/i,
  /обоснование необходимости/i,
  /носит информативный характер/i,
  /не оцениваются при рассмотрении/i,
];

function cleanValue(raw: string): string {
  let v = normalizeTzSpecText(raw);
  for (const re of NOISE_PHRASES) {
    const idx = v.search(re);
    if (idx >= 0) v = v.slice(0, idx).trim();
  }
  return v.slice(0, 200);
}

function splitCharNameValue(chunk: string): { name: string; value: string } | null {
  const text = chunk.trim();
  if (text.length < 4) return null;

  const presenceMatch = text.match(/^(.+?)\s+(наличие|отсутствие)\b/i);
  if (presenceMatch) {
    return { name: presenceMatch[1].trim(), value: presenceMatch[2].toLowerCase() };
  }

  const rangeMatch = text.match(
    /^(.+?)\s+(Больше или равно[\s\S]+?)(?:\s+Меньше или равно[\s\S]+?)?(?=\s+Объем|\s+Размер|\s+В соответствии|\s+Для\s|$)/i
  );
  if (rangeMatch) {
    return { name: rangeMatch[1].trim(), value: cleanValue(rangeMatch[2] + (text.match(/Меньше или равно[^.]+/)?.[0] ? " " + text.match(/Меньше или равно[^.]+/)![0] : "")) };
  }

  const starterMatch = text.match(/^(.+?)\s+(Больше или равно[\s\S]+)/i);
  if (starterMatch) {
    return { name: starterMatch[1].trim(), value: cleanValue(starterMatch[2]) };
  }

  const words = text.split(/\s+/);
  if (words.length <= 2) {
    return { name: text, value: "" };
  }

  for (let splitAt = Math.min(6, words.length - 1); splitAt >= 1; splitAt--) {
    const name = words.slice(0, splitAt).join(" ");
    const rest = words.slice(splitAt).join(" ");
    if (VALUE_STARTERS.test(rest) || /^\d+[,.]?\d*/.test(rest) || rest.length <= 80) {
      return { name, value: cleanValue(rest) };
    }
  }

  return { name: words.slice(0, 2).join(" "), value: cleanValue(words.slice(2).join(" ")) };
}

function findProductName(text: string, productNum: string): string {
  const re = new RegExp(
    `(?:^|\\s)${productNum}\\.\\s+([А-ЯЁA-Z«][^\\d]{8,120}?)(?=\\s+${productNum}\\.\\d|\\s+\\d+\\.\\s+[А-ЯЁ])`,
    "i"
  );
  const m = text.match(re);
  if (m) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (looksLikeProductName(name)) return name;
  }
  return "";
}

/** Имена изделий из структуры КТРУ: «1. Перчатки…» перед «1.1» */
function extractProductNamesFromKtruStructure(text: string): string[] {
  const names: string[] = [];
  const re =
    /(?:^|\s)(\d{1,2})\.\s+([А-ЯЁA-Z«][\p{L}\d\s,\-«»()\/\.]{6,110}?)(?=\s+\1\.\d{1,2}\s)/giu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[2].replace(/\s+/g, " ").trim();
    if (looksLikeProductName(name) && !isCharacteristicFieldName(name)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

function extractObjectNameFromHeader(text: string): string | null {
  const patterns = [
    /наименование\s+объекта\s+закупки[:\s]+([^.;\n]{8,140})/i,
    /наименование\s+товара[:\s]+([^.;\n]{8,140})/i,
    /предмет\s+закупки[:\s]+([^.;\n]{8,140})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].replace(/\s+/g, " ").trim();
      if (
        looksLikeProductName(name) &&
        !isCharacteristicFieldName(name) &&
        !isGenericProcurementTitle(name)
      ) {
        return name;
      }
    }
  }
  return null;
}

function extractProductsFromNomenclature(text: string): string[] {
  const products: string[] = [];
  const section = text.match(
    /наименование и количество поставляемых товаров([\s\S]{0,8000}?)(?:функциональные|технические|2\.\s*функцион)/i
  );
  const src = section ? section[1] : text;

  const re = /(?:^|\s)(\d{1,2})\s*\.?\s+([А-ЯЁA-Z][\p{L}\d\s,\-«»()]{8,120}?)(?:\s+Штука|\s+шт\.?|\s+Упаковка|\s+Комплект|\s+\d+\s)/giu;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[2].replace(/\s+/g, " ").trim();
    if (name.length > 8 && !/наименование|единица|количество|п\/п/i.test(name)) {
      if (looksLikeProductName(name) && !isCharacteristicFieldName(name)) {
        products.push(name);
      }
    }
  }
  return [...new Set(products)];
}

function extractCharacteristics(text: string): Array<{ product: string; name: string; value: string }> {
  const chars: Array<{ product: string; name: string; value: string }> = [];
  const charStarts = [...text.matchAll(/(\d{1,2})\.(\d{1,2})\s+/g)];

  const productCache = new Map<string, string>();

  for (let i = 0; i < charStarts.length; i++) {
    const start = charStarts[i];
    const productNum = start[1];
    const endIdx = charStarts[i + 1]?.index ?? text.length;
    const chunk = text.slice(start.index! + start[0].length, endIdx);

    if (!productCache.has(productNum)) {
      productCache.set(productNum, findProductName(text, productNum));
    }
    const product = productCache.get(productNum) || "";

    const parsed = splitCharNameValue(chunk);
    if (!parsed || !parsed.name || parsed.name.length < 2) continue;
    if (/наименование показателей|требуемое значение|обоснование/i.test(parsed.name)) continue;
    if (isCharacteristicFieldName(parsed.name) && !parsed.value) continue;

    chars.push({
      product,
      name: parsed.name.replace(/\s+/g, " ").trim(),
      value: parsed.value,
    });
  }

  return chars;
}

export function parseTzText(text: string): TzParseResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  const fromTable = extractProductsFromNomenclature(normalized);
  const fromKtru = extractProductNamesFromKtruStructure(normalized);
  const headerName = extractObjectNameFromHeader(normalized);
  const products = [...new Set([...fromTable, ...fromKtru, ...(headerName ? [headerName] : [])])];
  const characteristics = extractCharacteristics(normalized);

  const productSpecs: string[] = [];

  for (const p of products) {
    productSpecs.push(`Позиция ТЗ: ${p}`);
  }

  for (const c of characteristics) {
    const prefix = c.product ? `${c.product} — ` : "";
    const valuePart = c.value ? `: ${c.value}` : "";
    const spec = `${prefix}${c.name}${valuePart}`.replace(/\s+/g, " ").trim();
    if (spec.length > 8 && spec.length < 220) {
      productSpecs.push(spec);
    }
  }

  const ktruCodes = [...new Set([...normalized.matchAll(/\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/g)].map((m) => m[1]))];

  const hasRuRequirement =
    /регистрационн[ое]+\s+удостоверен|росздравнадзор|медицинск[ое]+\s+изделие|ру\s+на\s+медицин/i.test(
      normalized
    );

  if (hasRuRequirement && !productSpecs.some((s) => /ру|росздрав|регистрацион/i.test(s))) {
    productSpecs.unshift("Регистрационное удостоверение Росздравнадзора на медицинское изделие");
  }

  for (const code of ktruCodes.slice(0, 5)) {
    productSpecs.push(`КТРУ: ${code}`);
  }

  const uniqueSpecs = [...new Set(productSpecs)].slice(0, 80);

  const technicalAssignment = [
    products.length > 0 ? `Номенклатура из ТЗ: ${products.slice(0, 6).join("; ")}` : "",
    characteristics.length > 0
      ? `Характеристики из файла ТЗ (${characteristics.length} позиций)`
      : "",
  ]
    .filter(Boolean)
    .join(". ");

  return sanitizeTzParseResult({
    products,
    productSpecs: uniqueSpecs,
    technicalAssignment,
    ktruCodes,
    hasRuRequirement,
  });
}

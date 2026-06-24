/**
 * Каталог КТРУ на common-info.html zakupki.gov.ru — варианты набора и характеристики.
 */

import {
  buildDocxParseResult,
  type DocxKtruParseResult,
  type KtruProductBlock,
} from "@/lib/docxTableParser";
import { repairFragmentedRussian } from "@/lib/textNormalize";
import { deriveBlockVariantName } from "@/lib/ktruProductVariants";
import {
  isCharacteristicFieldName,
  isPlaceholderPositionName,
  looksLikeProductName,
} from "@/lib/tzSanitizer";

const KTRU_FULL_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/;
const NOISE_CHAR_RE =
  /участник\s+закупки|значение характеристики не может|инструкция по заполнению|обоснование дополнительных значений/i;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8805;/g, "≥")
    .replace(/&#8804;/g, "≤")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBoldSections(html: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  const re =
    /<span class="font-weight-bold">([\s\S]*?)<\/span>([\s\S]*?)(?=<span class="font-weight-bold">|<\/div>|$)/gi;
  for (const m of html.matchAll(re)) {
    const title = stripHtml(m[1]);
    const body = stripHtml(m[2]);
    if (title.length >= 3) sections.push({ title, body });
  }
  return sections;
}

function parseTruInfoCharacteristics(truInfoHtml: string): Array<{ name: string; value: string }> {
  const chars: Array<{ name: string; value: string }> = [];
  for (const row of truInfoHtml.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripHtml(c[1]));
    if (cells.length < 2) continue;
    if (/наименование характеристики/i.test(cells[0])) continue;
    const name = cells[0]?.replace(/:$/, "").trim();
    const value = cells[1]?.trim();
    if (!name || !value || name.length < 2) continue;
    if (NOISE_CHAR_RE.test(name) || NOISE_CHAR_RE.test(value)) continue;
    if (value.length > 400) continue;
    chars.push({ name, value });
  }
  return chars;
}

/** Индекс «код КТРУ → наименование» из таблиц на странице извещения */
function buildKtruNameIndex(html: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const m of html.matchAll(
    /(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\s+([А-Яа-яЁё][^<\n]{8,180})/g
  )) {
    const code = m[1];
    const name = repairFragmentedRussian(m[2].trim());
    if (!index.has(code) && looksLikeProductName(name)) {
      index.set(code, name);
    }
  }
  return index;
}

function findMainRowHtml(html: string, id: string): string | null {
  for (const row of html.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi)) {
    if (new RegExp(`showInfo\\('truInfo_${id}'`).test(row[0])) {
      return row[0];
    }
  }
  return null;
}

function extractKtruFromRow(mainHtml: string): string {
  return (
    mainHtml.match(/itemId=(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})/i)?.[1] ||
    mainHtml.match(KTRU_FULL_RE)?.[1] ||
    ""
  );
}

function extractProductNameFromRow(mainHtml: string, ktruIndex: Map<string, string>): string {
  const beforeMed = mainHtml.match(
    /([А-Яа-яЁё][^<(]{8,220}?)\s*&nbsp;\(является медицинским изделием\)/i
  );
  if (beforeMed) {
    const name = repairFragmentedRussian(stripHtml(beforeMed[1])).replace(/\s+/g, " ").trim();
    if (looksLikeProductName(name)) return name;
  }

  const ktru = extractKtruFromRow(mainHtml);
  if (ktru && ktruIndex.has(ktru)) return ktruIndex.get(ktru)!;

  return "";
}

function variantLabelFromMainRow(mainRowHtml: string, baseName: string): string {
  if (baseName && looksLikeProductName(baseName) && !isPlaceholderPositionName(baseName)) {
    return baseName;
  }

  const sections = extractBoldSections(mainRowHtml);
  const composition = sections.find((s) => /состав\s+набора/i.test(s.title));
  if (composition) {
    const text = `${composition.title}${composition.body ? `: ${composition.body.slice(0, 120)}` : ""}`;
    return repairFragmentedRussian(text).slice(0, 180);
  }

  for (const s of sections) {
    const title = repairFragmentedRussian(s.title);
    if (/^состав\s+набора|^набор\s+для|^1\.\s*(халат|простын|чехол|шапоч)/i.test(title)) {
      return title.slice(0, 180);
    }
    if (title.length > 20 && looksLikeProductName(title) && !isCharacteristicFieldName(title)) {
      return title.slice(0, 180);
    }
  }

  return baseName;
}

function extractTableCellsFromMainRow(mainHtml: string): string[] {
  const cells: string[] = [];
  for (const m of mainHtml.matchAll(/<td class="tableBlock__col"[^>]*>([\s\S]*?)<\/td>/gi)) {
    cells.push(stripHtml(m[1]).replace(/\u00a0/g, " ").trim());
  }
  return cells;
}

/** «300 000,00» → 300000 (копейки/дробная часть отбрасывается) */
function parseRussianQuantityCell(cell: string): number {
  const normalized = cell.replace(/\u00a0/g, " ").trim();
  const m = normalized.match(/^([\d\s]+)(?:[,.]\d+)?$/);
  if (!m) return 0;
  const qty = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return qty > 0 ? qty : 0;
}

/** Кол-во из строки каталога КТРУ: ячейка «Штука» → следующая ячейка с числом */
function extractQuantityFromEisMainRow(mainHtml: string): { quantity?: number; unit?: string } {
  const cells = extractTableCellsFromMainRow(mainHtml);
  for (let i = 0; i < cells.length - 1; i++) {
    const unitCell = cells[i];
    if (!/^(шт\.?|штук[аи]?|компл\.?|комплект|упак\.?|упаковк[аи]?|к-т)$/i.test(unitCell)) continue;
    const qty = parseRussianQuantityCell(cells[i + 1]);
    if (qty > 0 && qty < 1_000_000_000) {
      return {
        quantity: qty,
        unit: /компл|к-т|комплект/i.test(unitCell) ? "компл" : "шт",
      };
    }
  }
  return {};
}

function inlineCharacteristicsFromMainRow(mainRowHtml: string): Array<{ name: string; value: string }> {
  const chars: Array<{ name: string; value: string }> = [];
  for (const s of extractBoldSections(mainRowHtml)) {
    if (/состав\s+набора/i.test(s.title)) {
      if (s.body.length >= 8) chars.push({ name: "Состав набора", value: s.body.slice(0, 500) });
      continue;
    }
    const title = s.title.replace(/:$/, "").trim();
    if (!title || isCharacteristicFieldName(title)) {
      if (s.body && s.body.length >= 1 && s.body.length < 120) {
        chars.push({ name: title || "Характеристика", value: s.body });
      }
      continue;
    }
    if (s.body && s.body.length >= 1 && s.body.length < 120 && !NOISE_CHAR_RE.test(title)) {
      chars.push({ name: title, value: s.body });
    }
  }
  return chars;
}

/** Позиции каталога КТРУ с вариантами «Состав набора…» на странице извещения */
export function parseEisKtruCatalogHtml(html: string): DocxKtruParseResult | null {
  if (!html || !/truInfo_\d+/i.test(html)) return null;

  const ids = [
    ...new Set(
      [...html.matchAll(/showInfo\('truInfo_(\d+)'/gi)].map((m) => m[1])
    ),
  ].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (ids.length === 0) return null;

  const ktruIndex = buildKtruNameIndex(html);
  const blocks: KtruProductBlock[] = [];

  for (const id of ids) {
    const mainHtml = findMainRowHtml(html, id);
    if (!mainHtml) continue;

    const ktru = extractKtruFromRow(mainHtml);
    const baseName = extractProductNameFromRow(mainHtml, ktruIndex);

    const truInfoRe = new RegExp(
      `<tr class="truInfo_${id}"[^>]*>[\\s\\S]*?<\\/tr>`,
      "gi"
    );
    let truInfoHtml = "";
    for (const m of html.matchAll(truInfoRe)) {
      truInfoHtml += m[0];
    }

    const characteristics = [
      ...inlineCharacteristicsFromMainRow(mainHtml),
      ...parseTruInfoCharacteristics(truInfoHtml),
    ];

    const seen = new Set<string>();
    const uniqueChars = characteristics.filter((c) => {
      const key = `${c.name}|${c.value}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let variantLabel = variantLabelFromMainRow(mainHtml, baseName);
    if (!variantLabel || isPlaceholderPositionName(variantLabel)) {
      variantLabel = (ktru && ktruIndex.get(ktru)) || baseName || "";
    }

    const { quantity, unit: qtyUnit } = extractQuantityFromEisMainRow(mainHtml);

    blocks.push({
      position: id,
      name: variantLabel || (ktru ? ktruIndex.get(ktru) : "") || `Позиция ${id}`,
      code: ktru,
      quantity,
      unit: qtyUnit || "шт",
      characteristics: uniqueChars,
    });
  }

  if (blocks.length === 0) return null;

  for (const block of blocks) {
    if (
      (isPlaceholderPositionName(block.name) || !looksLikeProductName(block.name)) &&
      block.code &&
      ktruIndex.has(block.code)
    ) {
      block.name = ktruIndex.get(block.code)!;
    }
    if (block.name === blocks[0]?.name && blocks.length > 1) {
      const derived = deriveBlockVariantName(block);
      if (derived && !isPlaceholderPositionName(derived) && looksLikeProductName(derived)) {
        block.name = derived;
      }
    }
  }

  return buildDocxParseResult(blocks, "Каталог КТРУ из извещения ЕИС");
}

export function eisCatalogToDocumentParse(result: DocxKtruParseResult) {
  return {
    ...result,
    hasRuRequirement: true,
    quality: Math.min(100, 50 + result.products.length * 3 + result.productSpecs.length / 4),
    source: "docx-tables" as const,
  };
}

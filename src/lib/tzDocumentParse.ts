/**
 * Единая точка разбора вложения ТЗ (DOCX таблицы / текст / Excel НМЦК).
 */

import { parseDocxKtruTables, parseSimpleOozTable, parseWideOozTable, parseArticle33OozTable, parseNoKtruWideOozTable, buildDocxParseResult, type KtruProductBlock } from "@/lib/docxTableParser";
import { extractTextFromXlsxBuffer } from "@/lib/excelText";
import {
  isNmckExcelName,
  nmckItemsToParseResult,
  parseNmckExcelProducts,
  parseNmckDocxProducts,
  isNmckJustificationDocxName,
  type NmckLineItem,
} from "@/lib/nmckExcelParser";
import { extractTextFromDocxBuffer, detectOfficeFormat, unwrapOfficeArchive } from "@/lib/officeText";
import { parseTzText, type TzParseResult } from "@/lib/tzParser";
import { sanitizeTzParseResult, scoreTzParseQuality } from "@/lib/tzSanitizer";
import { deriveBlockVariantName, resolveBlockProductLabel } from "@/lib/ktruProductVariants";
import { isPlaceholderPositionName, looksLikeProductName } from "@/lib/tzSanitizer";

export interface DocumentParseResult extends TzParseResult {
  quality: number;
  source: "docx-tables" | "docx-text" | "xlsx-nmck" | "xlsx-text" | "unknown";
}

export function parseNmckExcelBuffer(buffer: Buffer): DocumentParseResult | null {
  const unwrapped = unwrapOfficeArchive(buffer);
  const workBuffer = unwrapped?.buffer ?? buffer;
  const items = parseNmckExcelProducts(workBuffer);
  if (items.length === 0) return null;

  const base = nmckItemsToParseResult(items);
  const result: DocumentParseResult = {
    ...base,
    hasRuRequirement: true,
    quality: Math.min(100, 50 + items.length * 2),
    source: "xlsx-nmck",
  };
  return result;
}

export function parseOozDocxBuffer(buffer: Buffer): DocumentParseResult | null {
  const article33 = parseArticle33OozTable(buffer);
  if (article33 && article33.products.length > 0) {
    const quality = scoreTzParseQuality(article33);
    if (quality >= 25) {
      return {
        ...article33,
        hasRuRequirement: true,
        quality,
        source: "docx-tables",
      };
    }
  }

  const noKtruWide = parseNoKtruWideOozTable(buffer);
  if (noKtruWide && noKtruWide.products.length > 0) {
    const quality = scoreTzParseQuality(noKtruWide);
    if (quality >= 25) {
      return {
        ...noKtruWide,
        hasRuRequirement: true,
        quality,
        source: "docx-tables",
      };
    }
  }

  const wideParse = parseWideOozTable(buffer);
  if (wideParse && wideParse.products.length > 0) {
    const quality = scoreTzParseQuality(wideParse);
    if (quality >= 25) {
      return {
        ...wideParse,
        hasRuRequirement: true,
        quality,
        source: "docx-tables",
      };
    }
  }

  // Простая таблица ООЗ (№ | Наименование | Характеристики в одной ячейке).
  const simpleParse = parseSimpleOozTable(buffer);
  if (simpleParse && simpleParse.products.length > 0) {
    const quality = scoreTzParseQuality(simpleParse);
    if (quality >= 25) {
      return {
        ...simpleParse,
        hasRuRequirement: true,
        quality,
        source: "docx-tables",
      };
    }
  }

  // Затем — экспортные таблицы КТРУ (многострочные OOZ).
  const tableParse = parseDocxKtruTables(buffer);
  if (tableParse && tableParse.products.length > 0) {
    const quality = scoreTzParseQuality(tableParse);
    if (quality >= 25) {
      return {
        ...tableParse,
        hasRuRequirement: true,
        quality,
        source: "docx-tables",
      };
    }
  }

  const text = extractTextFromDocxBuffer(buffer);
  if (!text || text.length < 100) return null;

  const parsed = sanitizeTzParseResult(parseTzText(text));
  return {
    ...parsed,
    quality: scoreTzParseQuality(parsed),
    source: "docx-text",
  };
}

export function parseDocumentAttachment(
  buffer: Buffer,
  fileName: string
): DocumentParseResult | null {
  const unwrapped = unwrapOfficeArchive(buffer);
  const workBuffer = unwrapped?.buffer ?? buffer;
  const effectiveName = unwrapped?.name || fileName;
  const format = detectOfficeFormat(workBuffer);

  if (format === "xlsx" || (isNmckExcelName(effectiveName) && format !== "pdf")) {
    const nmck = parseNmckExcelBuffer(workBuffer);
    if (nmck) return nmck;

    const text = extractTextFromXlsxBuffer(workBuffer);
    if (!text) return null;
    const parsed = sanitizeTzParseResult(parseTzText(text));
    return {
      ...parsed,
      quality: scoreTzParseQuality(parsed),
      source: "xlsx-text",
    };
  }

  if (format === "docx") {
    return parseOozDocxBuffer(workBuffer);
  }

  return null;
}

/** Дополняет разбор из файла характеристиками каталога КТРУ на ЕИС */
export function enrichParseWithEisCatalog(
  base: DocumentParseResult | null,
  eis: DocumentParseResult | null
): DocumentParseResult | null {
  if (!base || !eis?.productBlocks?.length) return base;

  const baseCharCount = base.productSpecs.filter((s) => s.includes(" — ")).length;
  const eisCharCount = eis.productSpecs.filter((s) => s.includes(" — ")).length;
  if (eisCharCount <= baseCharCount) return base;

  const sourceBlocks = base.productBlocks?.length ? base.productBlocks : eis.productBlocks;
  if (!sourceBlocks?.length) return base;

  const mergedBlocks: KtruProductBlock[] = [];

  for (const block of sourceBlocks) {
    const eisMatch = eis.productBlocks?.find(
      (b) => (block.code && b.code === block.code) || b.position === block.position
    );
    const name =
      looksLikeProductName(block.name) && !isPlaceholderPositionName(block.name)
        ? block.name
        : eisMatch?.name || block.name;

    const chars = [...block.characteristics];
    const seen = new Set(chars.map((c) => `${c.name}|${c.value}`.toLowerCase()));
    for (const ch of eisMatch?.characteristics || []) {
      const key = `${ch.name}|${ch.value}`.toLowerCase();
      if (!seen.has(key)) {
        chars.push(ch);
        seen.add(key);
      }
    }

    mergedBlocks.push({
      ...block,
      name,
      code: block.code || eisMatch?.code || "",
      characteristics: chars,
      quantity: block.quantity ?? eisMatch?.quantity,
    });
  }

  for (const eisBlock of eis.productBlocks) {
    const exists = mergedBlocks.some(
      (b) => (eisBlock.code && b.code === eisBlock.code) || b.position === eisBlock.position
    );
    if (!exists) mergedBlocks.push(eisBlock);
  }

  const rebuilt = buildDocxParseResult(mergedBlocks, base.technicalAssignment || eis.technicalAssignment);
  return {
    ...rebuilt,
    hasRuRequirement: true,
    quality: Math.max(base.quality, eis.quality),
    source: base.source,
    tzVolumes: base.tzVolumes?.length ? base.tzVolumes : rebuilt.tzVolumes,
  };
}

/** НМЦК даёт полные названия, ООЗ — характеристики по КТРУ */
export function mergeNmckAndOoz(
  nmckItems: NmckLineItem[],
  ooz: DocumentParseResult | null
): DocumentParseResult | null {
  if (nmckItems.length === 0) return ooz;

  const positionToVariant = new Map<string, string>();
  if (ooz?.productBlocks?.length) {
    for (const block of ooz.productBlocks) {
      if (block.position) {
        positionToVariant.set(block.position, resolveBlockProductLabel(block));
      }
    }
  }

  const defaultKtru = ooz?.ktruCodes?.[0] || "";
  const normalizedNmck = nmckItems.map((item) => ({
    ...item,
    ktruCode: item.ktruCode || defaultKtru,
  }));

  const nmck = nmckItemsToParseResult(normalizedNmck, positionToVariant);
  const specs = ooz ? [...ooz.productSpecs] : [];
  const seen = new Set(specs.map((s) => s.toLowerCase()));

  for (const spec of nmck.productSpecs) {
    const key = spec.toLowerCase();
    const isPosition = /^позиция\s*тз/i.test(key);
    const isCharLine = spec.includes(" — ");
    if (!isPosition && !isCharLine && seen.has(key)) continue;
    if (!isPosition && !isCharLine) seen.add(key);
    specs.push(spec);
  }

  const oozProducts = ooz?.products || [];
  const nmckProducts = nmck.products || [];
  const oozBlockCount = ooz?.productBlocks?.length ?? 0;
  const oozNamesGood = oozProducts.some((p) => looksLikeProductName(p) && !isPlaceholderPositionName(p));
  const nmckNamesGood = nmckProducts.some((p) => looksLikeProductName(p));

  const products =
    oozBlockCount >= nmckItems.length && oozProducts.length > 0 && oozNamesGood
      ? oozProducts
      : nmckNamesGood && nmckProducts.length > 0
        ? nmckProducts
        : oozProducts.length > 0
          ? oozProducts
          : nmckProducts;

  const tzVolumes =
    (ooz?.tzVolumes?.length ?? 0) >= (nmck.tzVolumes?.length ?? 0)
      ? ooz?.tzVolumes
      : nmck.tzVolumes?.length
        ? nmck.tzVolumes
        : ooz?.tzVolumes;

  return {
    products,
    productSpecs: specs.slice(0, 300),
    technicalAssignment: [ooz?.technicalAssignment, nmck.technicalAssignment]
      .filter(Boolean)
      .join(". "),
    ktruCodes: [...new Set([...(ooz?.ktruCodes || []), ...nmck.ktruCodes])],
    hasRuRequirement: true,
    quality: Math.min(100, 55 + products.length * 2 + Math.max(nmckItems.length, oozBlockCount)),
    source: oozBlockCount >= nmckItems.length ? ooz?.source || "docx-tables" : "xlsx-nmck",
    tzVolumes,
    productBlocks: ooz?.productBlocks,
  };
}

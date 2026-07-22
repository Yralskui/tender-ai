/**
 * Единая точка разбора вложения ТЗ (DOCX таблицы / текст / Excel НМЦК).
 */

import { parseDocxKtruTables, parseSimpleOozTable, parseWideOozTable, parseArticle33OozTable, parseNoKtruWideOozTable, parseStackedArticle33OozTable, buildDocxParseResult, type KtruProductBlock, type DocxKtruParseResult } from "@/lib/docxTableParser";
import { extractTextFromXlsxBuffer } from "@/lib/excelText";
import {
  isNmckExcelName,
  nmckItemsToParseResult,
  parseNmckExcelProducts,
  parseNmckDocxProducts,
  isNmckJustificationDocxName,
  type NmckLineItem,
} from "@/lib/nmckExcelParser";
import { extractTextFromDocxBuffer, extractTextFromDocBuffer, detectOfficeFormat, unwrapOfficeArchive } from "@/lib/officeText";
import { parseLegacyDocOozTable } from "@/lib/docLegacyParser";
import { parseTzText, type TzParseResult } from "@/lib/tzParser";
import { sanitizeTzParseResult, scoreTzParseQuality } from "@/lib/tzSanitizer";
import { deriveBlockVariantName, resolveBlockProductLabel } from "@/lib/ktruProductVariants";
import { parseMedicalTextileOozXlsx } from "@/lib/medicalTextileOozParser";
import { parseOozLineVolumesFromText, pickRicherTzVolumes, deriveTzVolumesFromRequirements } from "@/lib/tzVolumes";
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
  const asDocxTable = (parsed: DocxKtruParseResult | null): DocumentParseResult | null => {
    if (!parsed || parsed.products.length === 0) return null;
    const quality = scoreTzParseQuality(parsed);
    if (quality < 25) return null;
    return { ...parsed, hasRuRequirement: true, quality, source: "docx-tables" };
  };

  const blockCount = (r: DocumentParseResult) => r.productBlocks?.length ?? r.products.length;
  const maxBlockChars = (r: DocumentParseResult) =>
    Math.max(0, ...(r.productBlocks?.map((b) => b.characteristics.length) ?? [0]));

  const pickBest = (...candidates: Array<DocumentParseResult | null>): DocumentParseResult | null => {
    const valid = candidates.filter((c): c is DocumentParseResult => c != null);
    if (valid.length === 0) return null;
    valid.sort((a, b) => {
      const dBlocks = blockCount(b) - blockCount(a);
      if (dBlocks !== 0) return dBlocks;
      const megaA = maxBlockChars(a) > 25 ? 1 : 0;
      const megaB = maxBlockChars(b) > 25 ? 1 : 0;
      if (megaA !== megaB) return megaA - megaB;
      return b.quality - a.quality;
    });
    return valid[0]!;
  };

  const stackedArticle33 = asDocxTable(parseStackedArticle33OozTable(buffer));
  if (stackedArticle33) return stackedArticle33;

  const article33 = asDocxTable(parseArticle33OozTable(buffer));
  const ktruTables = asDocxTable(parseDocxKtruTables(buffer));
  const bestArticleOrKtru = pickBest(article33, ktruTables);
  if (bestArticleOrKtru) return bestArticleOrKtru;

  const noKtruWide = asDocxTable(parseNoKtruWideOozTable(buffer));
  if (noKtruWide) return noKtruWide;

  const wideParse = asDocxTable(parseWideOozTable(buffer));
  if (wideParse) return wideParse;

  const simpleParse = asDocxTable(parseSimpleOozTable(buffer));
  if (simpleParse) return simpleParse;

  const tableParse = ktruTables;
  if (tableParse) return tableParse;

  const text = extractTextFromDocxBuffer(buffer);
  if (!text || text.length < 100) return null;

  const parsed = sanitizeTzParseResult(parseTzText(text));
  return {
    ...parsed,
    quality: scoreTzParseQuality(parsed),
    source: "docx-text",
  };
}

/** Старый бинарный .doc (Word 97-2003): таблица ООЗ из текста, иначе — общий текстовый разбор */
export async function parseOozDocBuffer(buffer: Buffer): Promise<DocumentParseResult | null> {
  const text = await extractTextFromDocBuffer(buffer);
  if (!text || text.length < 100) return null;

  const table = parseLegacyDocOozTable(text);
  if (table && table.products.length > 0) {
    const quality = scoreTzParseQuality(table);
    if (quality >= 25) return { ...table, hasRuRequirement: true, quality, source: "docx-tables" };
  }

  const parsed = sanitizeTzParseResult(parseTzText(text));
  const lineVolumes = parseOozLineVolumesFromText(text);
  const tzVolumes = pickRicherTzVolumes(table?.tzVolumes, parsed.tzVolumes, lineVolumes);
  return {
    ...parsed,
    tzVolumes,
    quality: scoreTzParseQuality(parsed) + (lineVolumes.length > 0 ? 15 : 0),
    source: "docx-text",
  };
}

export async function parseDocumentAttachment(
  buffer: Buffer,
  fileName: string
): Promise<DocumentParseResult | null> {
  const unwrapped = unwrapOfficeArchive(buffer);
  const workBuffer = unwrapped?.buffer ?? buffer;
  const effectiveName = unwrapped?.name || fileName;
  const format = detectOfficeFormat(workBuffer);

  if (format === "doc") {
    return parseOozDocBuffer(workBuffer);
  }

  if (format === "xlsx" || (isNmckExcelName(effectiveName) && format !== "pdf")) {
    const nmck = parseNmckExcelBuffer(workBuffer);
    if (nmck) return nmck;

    const textileOoz = parseMedicalTextileOozXlsx(workBuffer);
    if (textileOoz && textileOoz.productSpecs.length > 0) return textileOoz;

    const text = extractTextFromXlsxBuffer(workBuffer);
    if (!text) return null;
    const parsed = sanitizeTzParseResult(parseTzText(text));
    const lineVolumes = parseOozLineVolumesFromText(text);
    const specVolumes = deriveTzVolumesFromRequirements({
      productSpecs: parsed.productSpecs,
      tzProducts: parsed.products,
      technicalAssignment: parsed.technicalAssignment,
    });
    const tzVolumes = pickRicherTzVolumes(parsed.tzVolumes, lineVolumes, specVolumes);
    return {
      ...parsed,
      tzVolumes,
      quality: scoreTzParseQuality(parsed) + (lineVolumes.length > 0 ? 15 : 0),
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

  const baseHasOwnBlocks = Boolean(base.productBlocks?.length);
  const sourceBlocks = baseHasOwnBlocks ? base.productBlocks! : eis.productBlocks;
  if (!sourceBlocks?.length) return base;

  // Крайний случай: у base изначально не было productBlocks (текстовый fallback
  // вместо таблицы ООЗ) — sourceBlocks тогда и есть eis.productBlocks, а eisMatch
  // ниже находит сам себя же с тем же самым «Позиция N». Единственный шанс на
  // настоящее название в этом случае — номенклатура из свободного текста ТЗ
  // (base.products), пусть даже она одна на все позиции.
  const freeTextProductName = base.products.find(
    (p) => looksLikeProductName(p) && !isPlaceholderPositionName(p)
  );

  const mergedBlocks: KtruProductBlock[] = [];

  for (const block of sourceBlocks) {
    const eisMatch = baseHasOwnBlocks
      ? eis.productBlocks?.find(
          (b) => (block.code && b.code === block.code) || b.position === block.position
        )
      : undefined;
    const eisMatchName =
      eisMatch && looksLikeProductName(eisMatch.name) && !isPlaceholderPositionName(eisMatch.name)
        ? eisMatch.name
        : undefined;
    const name =
      looksLikeProductName(block.name) && !isPlaceholderPositionName(block.name)
        ? block.name
        : eisMatchName || freeTextProductName || block.name;

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
  // Без структурных productBlocks «ооз» часто оказывается текстом не по теме
  // (напр. «Требования к содержанию заявки» ошибочно принятый за товар) — раз НМЦК
  // уже даёт реальные позиции, такой мусор в спеки не тащим.
  const oozHasStructure = Boolean(ooz?.productBlocks?.length);
  const specs = oozHasStructure ? [...(ooz?.productSpecs ?? [])] : [];
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

  const tzVolumes = pickRicherTzVolumes(ooz?.tzVolumes, nmck.tzVolumes);

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

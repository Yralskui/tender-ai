/**
 * Парсинг таблиц КТРУ из DOCX «Описание объекта закупки» (ЕИС экспорт).
 */

import AdmZip from "adm-zip";
import {
  isCharacteristicFieldName,
  isMaterialCompositionText,
  looksLikeProductName,
  isUsefulTzCharacteristic,
  isGenericProcurementTitle,
} from "@/lib/tzSanitizer";
import { isKtruCode, normalizeTzSpecText } from "@/lib/textNormalize";
import {
  deriveBlockVariantName,
  resolveBlockProductLabel,
  isKtruVariantHeaderChar,
} from "@/lib/ktruProductVariants";

export interface KtruProductBlock {
  position: string;
  name: string;
  code: string;
  quantity?: number;
  unit?: string;
  characteristics: Array<{ name: string; value: string }>;
}

export interface DocxKtruParseResult {
  products: string[];
  productBlocks: KtruProductBlock[];
  productSpecs: string[];
  technicalAssignment: string;
  ktruCodes: string[];
  tzVolumes?: Array<{
    name: string;
    ktruCode: string;
    quantity: number;
    unit: string;
    position: string;
  }>;
}

const KTRU_CODE_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}(?:-\d{8,})?)\b/;
const NOISE_VALUE_RE =
  /участник\s+закупки|значение характеристики|инструкция по заполнению|не может изменяться/i;

/** Разбивает ячейку «Материал: X.Размер: Y.…» на отдельные характеристики */
export function splitCharacteristicsBlob(blob: string): Array<{ name: string; value: string }> {
  let normalized = normalizeTzSpecText(blob)
    .replace(/([а-яё])([А-ЯA-Z])/g, "$1. $2")
    .replace(/годности\s*на\s*дату/gi, "годности на дату")
    .replace(/остаточный\s*срок/gi, "остаточный срок")
    .replace(/Требования\s*к/gi, "Требования к")
    .replace(/Больше\s*или\s*равно/gi, "Больше или равно")
    .replace(/резинке(?=\s*Требован)/gi, "резинке. Наличие: да. ")
    .replace(/рукав\s+на\s+резинке(?!\s*:)/gi, "Рукав на резинке: наличие. ")
    .replace(/(\d)\s*мес\b/gi, "$1 мес");

  const parts = normalized
    .split(/\.(?=\s*[А-ЯA-Z])|\.(?=[А-ЯA-Z])/)
    .map((p) => p.replace(/^\.\s*/, "").trim())
    .filter((p) => p.length > 2);

  const result: Array<{ name: string; value: string }> = [];
  for (const part of parts) {
    const m = part.match(/^([^:]{2,120}?):\s*(.+)$/);
    if (!m) continue;
    const name = m[1].replace(/\.$/, "").trim();
    const value = m[2].replace(/\.$/, "").trim();
    if (name.length < 2 || value.length < 1) continue;
    if (/наименование|характеристик|единица|количество|№\s*п/i.test(name)) continue;
    result.push({ name, value });
  }
  return result;
}

function cleanSimpleProductName(raw: string): { name: string; code: string } {
  const codeMatch = raw.match(KTRU_CODE_RE);
  const code = codeMatch?.[1] || "";
  let name = raw
    .replace(KTRU_CODE_RE, "")
    .replace(/\b\d{2}\.\d{2}\.\d{2}\.\d{3}\b/g, "")
    .replace(/,\s*-\d{5,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/,\s*$/, "")
    .trim();
  if (name.length < 4) name = raw.trim();
  return { name, code };
}

function findSimpleTableColumns(headerCells: string[]): { nameIdx: number; charIdx: number } | null {
  const lower = headerCells.map((c) => c.toLowerCase());
  const nameIdx = lower.findIndex((c) => /наименование/.test(c) && !/характеристик/.test(c));
  const charIdx = lower.findIndex((c) => /характеристик/.test(c));
  if (nameIdx < 0 || charIdx < 0) return null;
  return { nameIdx, charIdx };
}

function appendBlockCharacteristics(
  variantLabel: string,
  characteristics: Array<{ name: string; value: string }>,
  productSpecs: string[]
) {
  for (const ch of characteristics) {
    if (isKtruVariantHeaderChar(ch.name, ch.value)) continue;
    const prefixed = `${variantLabel} — ${ch.name}: ${ch.value}`;
    if (!isUsefulTzCharacteristic(prefixed, ch.name, ch.value)) continue;
    productSpecs.push(prefixed);
  }
}

function blockVariantLabel(block: KtruProductBlock, blocks: KtruProductBlock[]): string {
  const sameNameCount = blocks.filter((b) => b.name === block.name).length;
  if (blocks.length === 1) return resolveBlockProductLabel(block);
  if (sameNameCount > 1) return deriveBlockVariantName(block);
  return resolveBlockProductLabel(block);
}

export function buildDocxParseResult(blocks: KtruProductBlock[], sourceLabel: string): DocxKtruParseResult {
  const ktruCodes = [...new Set(blocks.map((b) => b.code).filter(Boolean))];
  const products: string[] = [];
  const productSpecs: string[] = [];
  const tzVolumes: DocxKtruParseResult["tzVolumes"] = [];
  let usefulChars = 0;

  for (const block of blocks) {
    const variantLabel = blockVariantLabel(block, blocks);
    products.push(variantLabel);
    if (block.position) productSpecs.push(`Позиция ТЗ №: ${block.position}`);
    productSpecs.push(`Позиция ТЗ: ${variantLabel}`);
    if (block.code) productSpecs.push(`КТРУ: ${block.code}`);
    if (block.position && block.quantity && block.quantity > 0) {
      tzVolumes.push({
        name: variantLabel,
        ktruCode: block.code,
        quantity: block.quantity,
        unit: block.unit || "шт",
        position: block.position,
      });
      productSpecs.push(`Объём закупки: ${block.quantity} ${block.unit || "шт"} — ${variantLabel}`);
    }

    const before = productSpecs.length;
    appendBlockCharacteristics(variantLabel, block.characteristics, productSpecs);
    usefulChars += productSpecs.length - before;
  }

  const uniqueNames = products.filter((p) => p.length >= 6);

  return {
    products: uniqueNames.length > 0 ? uniqueNames : products.slice(0, 80),
    productBlocks: blocks,
    productSpecs,
    technicalAssignment: `${sourceLabel}: ${blocks.length} объектов закупки, ${usefulChars} значимых характеристик`,
    ktruCodes,
    tzVolumes: tzVolumes.length > 0 ? tzVolumes : undefined,
  };
}

/** Таблица ООЗ в формате № | Наименование | Характеристики товара | Ед. | Кол-во */
export function parseSimpleOozTable(buffer: Buffer): DocxKtruParseResult | null {
  if (buffer.length < 100) return null;

  let xml: string;
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    xml = entry.getData().toString("utf8");
  } catch {
    return null;
  }

  const blocks: KtruProductBlock[] = [];

  for (const tbl of xml.matchAll(/<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g)) {
    const rows = [...tbl[1].matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) =>
      extractRowCells(r[1])
    );
    if (rows.length < 2) continue;

    const cols = findSimpleTableColumns(rows[0]);
    if (!cols) continue;

    for (const cells of rows.slice(1)) {
      if (cells.length <= Math.max(cols.nameIdx, cols.charIdx)) continue;
      const position = cells[0] || "";
      if (!/^\d{1,3}$/.test(position)) continue;

      const nameRaw = cells[cols.nameIdx] || "";
      const charBlob = cells[cols.charIdx] || "";
      if (!nameRaw || nameRaw.length < 4 || !charBlob || charBlob.length < 4) continue;

      const { name, code } = cleanSimpleProductName(nameRaw);
      const characteristics = splitCharacteristicsBlob(charBlob);
      if (characteristics.length === 0) continue;

      blocks.push({ position, name, code, characteristics });
    }
  }

  if (blocks.length === 0) return null;
  return buildDocxParseResult(blocks, "Номенклатура из ТЗ");
}

function parseNoKtruCharRow(cells: string[]): { name: string; value: string } | null {
  const name = (cells[0] || "").trim();
  const value = (cells[1] || "").trim();
  if (!name || !value || name.length < 2) return null;
  if (/^\d{1,3}$/.test(name)) return null;
  if (/^наименование\s+показател|^значение\s+показател|^инструкция|^№\s*п/i.test(name)) return null;
  if (/^участник\s+закупки\s+указывает/i.test(value)) return null;
  if (NOISE_VALUE_RE.test(name)) return null;
  if (/^значение характеристики не может/i.test(value)) return null;
  return { name: name.replace(/:$/, ""), value: cleanCharValue(value) };
}

function parseUnitQtyFromCells(cells: string[]): { quantity: number; unit: string } | null {
  for (let i = 3; i < cells.length; i++) {
    const unit = (cells[i] || "").trim();
    const qtyRaw = (cells[i + 1] || "").trim();
    if (!/^(шт|штук|компл|к-т|упак|комп)/i.test(unit)) continue;
    const qty = parseInt(qtyRaw.replace(/[^\d]/g, ""), 10);
    if (qty > 0) {
      return { quantity: qty, unit: /компл|к-т|комп/i.test(unit) ? "компл" : "шт" };
    }
  }
  const joined = cells.join(" ");
  const m = joined.match(/(\d+(?:[.,]\d+)?)\s*(компл|к-т|шт|штук)/i);
  if (m) {
    const qty = parseInt(m[1].replace(/[^\d]/g, ""), 10);
    if (qty > 0) return { quantity: qty, unit: /компл|к-т/i.test(m[2]) ? "компл" : "шт" };
  }
  return null;
}

/** ООЗ без КТРУ: № п/п | Наименование | показатели построчно (Самарская и др. площадки) */
export function parseNoKtruWideOozTable(buffer: Buffer): DocxKtruParseResult | null {
  if (buffer.length < 100) return null;

  let xml: string;
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    xml = entry.getData().toString("utf8");
  } catch {
    return null;
  }

  const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => extractRowCells(r[1]));
  const hasOozHeader = rows.some(
    (cells) =>
      cells.some((c) => /№\s*п\/п/i.test(c)) &&
      cells.some((c) => /^наименование$/i.test(c.trim()) || /наименование\s+товара/i.test(c))
  );
  if (!hasOozHeader) return null;

  const blocks: KtruProductBlock[] = [];
  let current: KtruProductBlock | null = null;

  for (const cells of rows) {
    if (cells.every((c) => !c)) continue;

    if (
      cells.some((c) => /№\s*п\/п/i.test(c)) &&
      cells.some((c) => /наименование/i.test(c) && /характеристик/i.test(c))
    ) {
      continue;
    }
    if (
      cells.some((c) => /наименование показател/i.test(c)) &&
      cells.some((c) => /значение показател/i.test(c))
    ) {
      continue;
    }

    const pos = (cells[0] || "").trim();
    const nameCell = (cells[1] || "").trim();
    if (/^\d{1,3}$/.test(pos) && nameCell.length >= 8 && looksLikeProductName(nameCell)) {
      if (current) blocks.push(current);
      const { name, code } = cleanSimpleProductName(nameCell);
      const vol = parseUnitQtyFromCells(cells);
      current = {
        position: pos,
        name,
        code,
        quantity: vol?.quantity,
        unit: vol?.unit,
        characteristics: [],
      };

      const field = (cells[2] || "").trim();
      const value = (cells[3] || "").trim();
      if (
        field &&
        value &&
        !/участник\s+закупки/i.test(value) &&
        !/^значение характеристики не может/i.test(value)
      ) {
        current.characteristics.push({ name: field, value: cleanCharValue(value) });
      }
      continue;
    }

    if (!current) continue;

    const vol = parseUnitQtyFromCells(cells);
    if (vol && !current.quantity) {
      current.quantity = vol.quantity;
      current.unit = vol.unit;
      continue;
    }

    const ch = parseNoKtruCharRow(cells);
    if (ch) current.characteristics.push(ch);
  }

  if (current) blocks.push(current);
  if (blocks.length === 0) return null;
  return buildDocxParseResult(blocks, "Номенклатура из ООЗ (без КТРУ)");
}

/** Широкая таблица ООЗ в стиле ЕИС: Наименование + код + (наименование характеристики / значение) */
export function parseWideOozTable(buffer: Buffer): DocxKtruParseResult | null {
  if (buffer.length < 100) return null;

  let xml: string;
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    xml = entry.getData().toString("utf8");
  } catch {
    return null;
  }

  const blocks: KtruProductBlock[] = [];
  let current: KtruProductBlock | null = null;

  for (const row of xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
    const cells = extractRowCells(row[1]);
    if (cells.every((c) => !c)) continue;

    // Заголовок таблицы пропускаем.
    if (
      cells.some((c) => /наименование характеристики/i.test(c)) &&
      cells.some((c) => /значение характеристики/i.test(c))
    ) {
      continue;
    }

    const positionRaw = (cells[0] || "").trim();
    const isNewProduct =
      /^\d{1,3}\.?$/.test(positionRaw) && Boolean(cells[1]) && Boolean(cells[2] && KTRU_CODE_RE.test(cells[2]));
    if (isNewProduct) {
      if (current) blocks.push(current);
      const baseName = cells[1]
        .replace(/обоснование\s+включения[\s\S]*$/i, "")
        .replace(/обоснование[\s\S]*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const { name } = cleanSimpleProductName(baseName || cells[1]);
      const code = (cells[2].match(KTRU_CODE_RE)?.[1] || "").trim();
      current = { position: positionRaw.replace(/\.$/, ""), name, code, characteristics: [] };

      // В некоторых файлах первая характеристика лежит в той же строке.
      const inline = isCharacteristicRow(["", "", "", cells[3] || "", cells[4] || "", cells[5] || ""]);
      if (inline) current.characteristics.push(inline);
      continue;
    }

    if (current) {
      const ch = isCharacteristicRow(["", "", "", cells[3] || "", cells[4] || "", cells[5] || ""]);
      if (ch) current.characteristics.push(ch);
    }
  }

  if (current) blocks.push(current);
  if (blocks.length === 0) return null;
  return buildDocxParseResult(blocks, "Номенклатура из таблицы ООЗ");
}

function extractRowCells(trXml: string): string[] {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
    const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return texts.join("").replace(/\s+/g, " ").trim();
  }).map((cell) => normalizeTzSpecText(cell));
}

function cleanCharValue(raw: string): string {
  let v = normalizeTzSpecText(raw);
  const idx = v.search(NOISE_VALUE_RE);
  if (idx > 0) v = v.slice(0, idx).trim();
  return v.slice(0, 120);
}

function isProductRow(cells: string[]): { position: string; name: string; code: string } | null {
  if (cells.length < 3) return null;
  const position = cells[0];
  if (!/^\d{1,3}\.?$/.test(position)) return null;

  const codeCell = cells.find((c) => KTRU_CODE_RE.test(c)) || cells[1] || cells[2] || "";
  const codeMatch = codeCell.match(KTRU_CODE_RE);
  if (!codeMatch) return null;

  // В разных экспортных DOCX:
  // - вариант A: [0]=№, [1]=КТРУ, [2]=Наименование товара
  // - вариант B: [0]=№, [1]=Наименование, [2]=Код позиции (КТРУ)
  const hasCodeIn2 = Boolean(cells[2] && KTRU_CODE_RE.test(cells[2]));
  const nameCandidates = hasCodeIn2
    ? [cells[1], cells[3], cells.slice(1).join(" ")]
    : [cells[2], cells[1], cells[3], cells.slice(1).join(" ")];
  const name = (nameCandidates.find((c) => c && !KTRU_CODE_RE.test(c)) || "").trim();
  if (name.length < 4 || /наименован|характеристик|№\s*п\/п/i.test(name)) return null;
  if (KTRU_CODE_RE.test(name) || isKtruCode(name)) return null;

  return { position: position.replace(/\.$/, ""), name, code: codeMatch[1] };
}

function isCharacteristicRow(cells: string[]): { name: string; value: string } | null {
  if (cells.length < 2) return null;

  // ЕИС-таблица КТРУ часто имеет 3 пустых колонки (№/КТРУ/Наименование),
  // а характеристики лежат в колонках 4..6.
  const hasOffsetFields = !cells[0] && !cells[1] && !cells[2] && Boolean(cells[3]);
  const nameRaw = hasOffsetFields ? cells[3] : cells[0];
  const valueRaw = hasOffsetFields ? (cells[5] || cells[4] || cells.slice(4).join(" ")) : (cells[1] || cells.slice(1).join(" "));

  const name = (nameRaw || "").trim();
  if (!name || /^\d{1,3}$/.test(name)) return null;
  if (/наименование характеристик|наименование показателя|требуемое значение|единица измерения/i.test(name)) return null;
  if (NOISE_VALUE_RE.test(name)) return null;

  const value = cleanCharValue(valueRaw || "");
  if (!value || value.length < 1) return null;

  return { name: name.replace(/:$/, "").trim(), value };
}

export function parseDocxKtruTables(buffer: Buffer): DocxKtruParseResult | null {
  if (buffer.length < 100) return null;

  let xml: string;
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    xml = entry.getData().toString("utf8");
  } catch {
    return null;
  }

  const rowCount = (xml.match(/<w:tr/g) || []).length;
  // Бывают маленькие OOZ на 1 позицию (10–20 строк) — их тоже парсим.
  if (rowCount < 6) return null;

  const blocks: KtruProductBlock[] = [];
  let current: KtruProductBlock | null = null;

  for (const row of xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
    const cells = extractRowCells(row[1]);
    if (cells.every((c) => !c)) continue;

    const product = isProductRow(cells);
    if (product) {
      if (current) blocks.push(current);
      current = {
        position: product.position,
        name: product.name,
        code: product.code,
        characteristics: [],
      };

      // В некоторых экспортных OOZ первая характеристика лежит в той же строке, что и товар.
      const inlineChar = isCharacteristicRow(["", "", "", cells[3] || "", cells[4] || "", cells[5] || ""]);
      if (inlineChar) {
        current.characteristics.push(inlineChar);
      }
      continue;
    }

    const ch = isCharacteristicRow(cells);
    if (ch && current) {
      if (!isCharacteristicFieldName(ch.name) || ch.value.length > 2) {
        current.characteristics.push(ch);
      }
    }
  }
  if (current) blocks.push(current);

  if (blocks.length === 0) return null;
  const result = buildDocxParseResult(blocks, "Номенклатура из таблиц КТРУ");
  return {
    ...result,
    productSpecs: result.productSpecs.slice(0, 120),
  };
}

export function docxLooksLikeKtruExport(buffer: Buffer): boolean {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return false;
    const xml = entry.getData().toString("utf8");
    return (xml.match(/<w:tr/g) || []).length >= 80 && (xml.match(/<w:tbl/g) || []).length >= 10;
  } catch {
    return false;
  }
}

function cleanArticle33ProductName(raw: string): string {
  return normalizeTzSpecText(raw)
    .replace(/обоснование\s+включения[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isArticle33ProductRow(cells: string[]): {
  name: string;
  code: string;
  position: string;
  quantity?: number;
  unit?: string;
  inlineChar?: { name: string; value: string };
} | null {
  const position = (cells[0] || "").trim();
  if (!/^\d{1,3}$/.test(position)) return null;

  const joined = cells.join(" ");
  const codeMatch = (cells[1] || "").match(KTRU_CODE_RE) || joined.match(KTRU_CODE_RE);
  if (!codeMatch) return null;

  const nameCell = cleanArticle33ProductName((cells[2] || "").trim());
  const unitCell = (cells[3] || "").trim();
  const qtyCell = (cells[4] || "").trim();
  const hasUnit = /^(шт|штук)/i.test(unitCell);
  const hasQty = /^\d+$/.test(qtyCell);

  if (
    nameCell.length >= 8 &&
    !isKtruCode(nameCell) &&
    !isMaterialCompositionText(nameCell) &&
    (hasUnit || hasQty)
  ) {
    const quantity = hasQty ? parseInt(qtyCell, 10) : 0;
    const unit = hasUnit ? "шт" : "шт";
    const charName = (cells[5] || "").trim();
    const charVal = (cells[6] || "").trim();
    let inlineChar: { name: string; value: string } | undefined;
    if (
      charName &&
      charVal &&
      charName.length <= 120 &&
      isCharacteristicFieldName(charName) &&
      !looksLikeProductName(charVal) &&
      !isMaterialCompositionText(charVal)
    ) {
      inlineChar = { name: charName.replace(/:$/, ""), value: charVal };
    }
    return { position, name: nameCell, code: codeMatch[1], quantity, unit, inlineChar };
  }

  let name = "";
  const candidates: string[] = [];
  for (const cell of cells) {
    const cleaned = cleanArticle33ProductName(cell);
    if (cleaned.length < 8) continue;
    if (/^КТРУ:/i.test(cleaned)) continue;
    if (/^ОКПД|^НКМИ/i.test(cleaned)) continue;
    if (/наименование\s+товара|характеристик|единица\s+измерения/i.test(cleaned)) continue;
    if (isMaterialCompositionText(cleaned)) continue;
    if (
      looksLikeProductName(cleaned) ||
      /^(простын|чехол|халат|салфет|маск|перчат|бахил|костюм|набор|комплект|шапоч)/i.test(cleaned)
    ) {
      candidates.push(cleaned);
    }
  }
  if (candidates.length > 0) {
    const scored = candidates.map((c) => {
      let score = 0;
      if (c === nameCell) score += 200;
      if (/^(шапоч|халат|простын|набор|комплект|салфет|маск|перчат|бахил|чехол)\b/i.test(c)) score += 120;
      if (/одноразового\s+использования|стерильн/i.test(c)) score += 40;
      if (/^чехол\s+хирургическ/i.test(c) && c.length < 60) score -= 40;
      score -= Math.max(0, c.length - 90);
      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    name = scored[0].c;
  }
  if (!name) return null;

  return { position, name, code: codeMatch[1] };
}

function isArticle33ValueToken(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(соответствие|наличие|отсутствие)$/i.test(t)) return true;
  if (/^(≥|<=|≥|≤)/.test(t) || /\d/.test(t)) return true;
  if (/^(сантиметр|миллиметр|грамм|шт|штук|процент|%)$/i.test(t)) return true;
  if (t.length <= 120 && !/наименование|участник\s+закупки/i.test(t)) return true;
  return false;
}

/** Таблица ООЗ по ст. 33 44-ФЗ: товар + КТРУ в строке, характеристики чередуются отдельными строками */
export function parseArticle33OozTable(buffer: Buffer): DocxKtruParseResult | null {
  if (buffer.length < 100) return null;

  let xml: string;
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    xml = entry.getData().toString("utf8");
  } catch {
    return null;
  }

  const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => extractRowCells(r[1]));
  const hasArticle33Header = rows.some((cells) =>
    cells.some((c) => {
      const compact = c.replace(/\s+/g, "");
      return (
        /наименование\s+товара.*дополнительная\s+информация/i.test(compact) ||
        /наименованиетовара.*дополнительнаяинформация/i.test(compact)
      );
    })
  );
  const hasArticle33ProductShape = rows.some((cells) => isArticle33ProductRow(cells) !== null);
  if (!hasArticle33Header && !hasArticle33ProductShape) return null;

  const blocks: KtruProductBlock[] = [];
  let current: KtruProductBlock | null = null;
  let pendingCharName: string | null = null;

  const flushPending = () => {
    if (current && pendingCharName) {
      current.characteristics.push({ name: pendingCharName, value: "Соответствие" });
      pendingCharName = null;
    }
  };

  for (const cells of rows) {
    const filled = cells.filter((c) => c && c.length > 0);
    if (filled.length === 0) continue;

    const product = isArticle33ProductRow(cells);
    if (product) {
      if (current) blocks.push(current);
      current = {
        position: product.position,
        name: product.name,
        code: product.code,
        quantity: product.quantity,
        unit: product.unit,
        characteristics: [],
      };
      pendingCharName = product.inlineChar?.name || null;
      if (product.inlineChar?.value) {
        current.characteristics.push({
          name: product.inlineChar.name,
          value: product.inlineChar.value,
        });
        pendingCharName = null;
      }
      continue;
    }

    if (!current) continue;

    if (filled.length >= 2) {
      const name = filled[0].replace(/:$/, "").trim();
      const value = cleanCharValue(filled.slice(1).join(" "));
      if (name.length >= 2 && value && !NOISE_VALUE_RE.test(name)) {
        flushPending();
        current.characteristics.push({ name, value });
      }
      continue;
    }

    const token = filled[0].trim();
    if (/^(сантиметр|миллиметр|грамм|штук|штука|процент|%|мм|см|кг)$/i.test(token)) continue;
    if (/^\d{1,6}$/.test(token)) continue;
    if (NOISE_VALUE_RE.test(token)) continue;
    if (/^участник\s+закупки/i.test(token)) continue;

    // Ст. 33 в ЕИС: строка с 4+ ячейками — имя характеристики, с 3 — значение
    if (filled.length === 1) {
      const isValueRow = cells.length <= 3;

      if (isValueRow) {
        if (pendingCharName) {
          current.characteristics.push({ name: pendingCharName, value: cleanCharValue(token) });
          pendingCharName = null;
        }
        continue;
      }

      if (pendingCharName) {
        current.characteristics.push({ name: pendingCharName, value: "Соответствие" });
      }
      if (token.length >= 3 && token.length <= 200) {
        pendingCharName = token;
      }
    }
  }

  if (current) blocks.push(current);
  flushPending();

  if (blocks.length === 0) return null;
  return buildDocxParseResult(blocks, "Номенклатура из ООЗ (ст. 33)");
}

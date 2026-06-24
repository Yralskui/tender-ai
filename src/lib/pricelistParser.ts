/**
 * Парсер нет-прайсов поставщиков (PDF → текст).
 * Формат A: коммерческое предложение (блоки Наименование + Спец.цена).
 * Формат B: каталог Инмедиз (строка с нестерильн./стерильн. и двумя ценами).
 */

export interface ParsedSupplierPriceItem {
  name: string;
  displayName: string;
  unit: string;
  unitPrice: number;
  unitPriceSterile?: number;
  priceBasis: string;
  categoryText?: string;
  vendor?: string;
  thicknessUm?: number;
  densityGsm?: number;
  sizeText?: string;
  colorText?: string;
  materialText?: string;
  packRatio?: string;
  elasticType?: string;
}

function parseRubPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PRICE_ONLY_RE = /^\d{1,4}[,.]\d{2}$/;
const PRODUCT_START_RE =
  /^(БАХИЛЫ|ШАПОЧКА|МАСКА|ПЕРЧАТКИ|КОНТЕЙНЕР|НАРУКАВНИК|ФАРТУК|НОСКИ|КОМБИНЕЗОН|ХАЛАТ|ПРОСТЫН|НАВОЛОЧК|ПОДГУЗНИК)/i;
const CATEGORY_RE =
  /^(Бахилы|Шапочки|Маски|Перчатки|Контейнеры|Нарукавники|Фартук|Носки|Халаты|Простыни)/i;
const SPEC_RE = /^(Толщина|Плотность|Цвет|Размер|Объем|Вес|Материал|Резинка):/i;
const SKIP_RE =
  /^(КОММЕРЧЕСКОЕ|Наименование|Спец\.?цена|\d{2}\.\d{2}\.\d{3}|--\s*\d+\s+of|--|ООО|Адрес:|Тел|www\.|Прайс|Регистрационное|Вся выпускаемая|Группа|товара|Ед\.|изм\.|Кол-во|ООО|№\s*Характеристика|Идеальн|Фиксируются|Выпускаются|Хирургич|еская|одежда)/i;

function isGarbagePriceName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.length > 160) return true;
  if (/идеальн\s+для\s+использован/i.test(n)) return true;
  if (/фиксируются\s+на\s+ноге/i.test(n)) return true;
  if (/выпускаются\s+в\s+стерильн/i.test(n) && !/штука|пара|№/.test(n)) return true;
  if (/^\d+\s+бахил/i.test(n)) return true;
  if (/^бахилы\s+хирургические\s+идеальн/i.test(n)) return true;
  if (!PRODUCT_START_RE.test(name) && !/шапоч|берет|халат|маск|простын/i.test(name)) return true;
  return false;
}

const INMEDIZ_TAIL_RE =
  /\((?:нестерильн[^)]*)\)\s*(пара|штука)\s+(\d+(?:\/\d+)?)\s+7\s+0[,.]08\s+(\d+[,.]\d+)(?:\/(\d+[,.]\d+))?/i;

const INMEDIZ_TAIL_ALT_RE =
  /(пара|штука)\s+(\d+(?:\/\d+)?)\s+7\s+0[,.]08\s+(\d+[,.]\d+)(?:\/(\d+[,.]\d+))?/i;

interface ProductDraft {
  name: string;
  specs: string[];
  categoryText?: string;
}

function finalizeDraft(draft: ProductDraft, priceBasis: string): ParsedSupplierPriceItem | null {
  const specText = draft.specs.join(" ");
  const displayName = [draft.name, ...draft.specs].join(" · ").trim();
  let thicknessUm: number | undefined;
  let densityGsm: number | undefined;
  let sizeText: string | undefined;
  let colorText: string | undefined;
  let materialText: string | undefined;
  let elasticType: string | undefined;
  let packRatio: string | undefined;

  const thickM = specText.match(/Толщина:\s*(\d+)\s*мкм/i);
  if (thickM) thicknessUm = parseInt(thickM[1], 10);
  const densM = specText.match(/Плотность:\s*(\d+)/i);
  if (densM) densityGsm = parseInt(densM[1], 10);
  const sizeM = specText.match(/Размер:\s*([^·]+?)(?:\s+Объем|$)/i);
  if (sizeM) sizeText = sizeM[1].trim();
  const colorM = specText.match(/Цвет:\s*([^·]+?)(?:\s+Материал|\s+Резинка|\s+Размер|$)/i);
  if (colorM) colorText = colorM[1].trim();
  const matM = specText.match(/Материал:\s*([^·]+?)(?:\s+Размер|$)/i);
  if (matM) materialText = matM[1].trim();
  const elM = specText.match(/Резинка:\s*(\S+)/i);
  if (elM) elasticType = elM[1];
  const packM = draft.name.match(/№\s*([\d]+(?:\/\d+)?)/i);
  if (packM) packRatio = packM[1];

  let unit = "пара";
  let basis = priceBasis || "за пару";
  if (/штук/i.test(basis) || /штук/i.test(draft.categoryText || "")) unit = "штука";
  if (/упаковк/i.test(basis) || /упаковк/i.test(draft.categoryText || "")) unit = "упаковка";

  return {
    name: draft.name,
    displayName,
    unit,
    unitPrice: 0,
    priceBasis: basis,
    categoryText: draft.categoryText,
    thicknessUm,
    densityGsm,
    sizeText,
    colorText,
    materialText,
    packRatio,
    elasticType,
  };
}

/** Формат A: коммерческое предложение со спец.ценами */
export function parseCommercialProposalText(text: string, vendor?: string): ParsedSupplierPriceItem[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SKIP_RE.test(l));

  const drafts: ProductDraft[] = [];
  const prices: number[] = [];
  let category = "";
  let priceBasis = "за пару с НДС 10%";
  let current: ProductDraft | null = null;

  for (const line of lines) {
    if (CATEGORY_RE.test(line) && /цена за/i.test(line)) {
      category = line.split("(")[0].trim();
      const basisM = line.match(/\(([^)]+)\)/);
      if (basisM) priceBasis = basisM[1];
      continue;
    }

    const priceVal = parseRubPrice(line);
    if (PRICE_ONLY_RE.test(line.replace(/\s/g, "")) && priceVal) {
      prices.push(priceVal);
      continue;
    }

    if (PRODUCT_START_RE.test(line)) {
      if (current) drafts.push(current);
      current = { name: line, specs: [], categoryText: category || undefined };
      continue;
    }

    if (current && SPEC_RE.test(line)) {
      current.specs.push(line);
      continue;
    }
  }
  if (current) drafts.push(current);

  const items: ParsedSupplierPriceItem[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const item = finalizeDraft(drafts[i], priceBasis);
    if (!item) continue;
    if (isGarbagePriceName(item.name)) continue;
    if (i < prices.length) item.unitPrice = prices[i];
    if (vendor) item.vendor = vendor;
    if (item.unitPrice > 0) items.push(item);
  }

  return items;
}

/** Формат B: прайс Инмедиз и похожие каталоги */
export function parseInmedizCatalogText(text: string, vendor = "Инмедиз"): ParsedSupplierPriceItem[] {
  const items: ParsedSupplierPriceItem[] = [];
  let buffer = "";

  const flush = () => {
    const flat = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (flat.length < 15) return;

    const m = flat.match(INMEDIZ_TAIL_RE) || flat.match(INMEDIZ_TAIL_ALT_RE);
    if (!m) return;

    const unitWord = m[1]?.toLowerCase();
    const unit = unitWord === "штука" ? "штука" : "пара";
    const packRatio = m[2];
    const price1 = parseRubPrice(m[3]);
    const price2 = parseRubPrice(m[4]);
    if (!price1) return;

    const tailAt = flat.search(INMEDIZ_TAIL_RE) >= 0 ? flat.search(INMEDIZ_TAIL_RE) : flat.search(INMEDIZ_TAIL_ALT_RE);
    const namePart = flat
      .slice(0, tailAt > 0 ? tailAt : flat.length)
      .replace(/\(нестерильные\/стерильные\)/gi, "")
      .replace(/\(нестерильн[^)]*\)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (namePart.length < 6) return;
    if (isGarbagePriceName(namePart)) return;

    items.push({
      name: namePart.slice(0, 160),
      displayName: namePart,
      unit,
      unitPrice: price1,
      unitPriceSterile: price2 ?? undefined,
      priceBasis: "нестерильн./стерильн. с НДС 10%",
      vendor,
      packRatio,
    });
  };

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line || SKIP_RE.test(line) || /^--\s*\d+\s+of/i.test(line)) continue;
    buffer = buffer ? `${buffer} ${line}` : line;
    if (INMEDIZ_TAIL_RE.test(buffer) || INMEDIZ_TAIL_ALT_RE.test(buffer)) {
      flush();
    } else if (buffer.length > 400) {
      buffer = line;
    }
  }
  flush();

  return items;
}

export function detectPricelistFormat(text: string): "inmediz" | "commercial" | "unknown" {
  if (/ООО\s*["']?ИНМЕДИЗ/i.test(text) || /нестерильн\.\/стерильн/i.test(text)) {
    return "inmediz";
  }
  if (/КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ/i.test(text) || /Спец\.?цена/i.test(text)) {
    return "commercial";
  }
  return "unknown";
}

export function parsePricelistText(text: string, options: { vendor?: string; fileName?: string } = {}) {
  const vendor =
    options.vendor ||
    (options.fileName?.match(/инмедиз/i) ? "Инмедиз" : undefined) ||
    (options.fileName?.match(/спец\.?цена/i) ? "Поставщик" : undefined);

  const format = detectPricelistFormat(text);
  let items: ParsedSupplierPriceItem[] = [];

  if (format === "inmediz") {
    items = parseInmedizCatalogText(text, vendor || "Инмедиз");
  } else if (format === "commercial") {
    items = parseCommercialProposalText(text, vendor);
  } else {
    const a = parseCommercialProposalText(text, vendor);
    const b = parseInmedizCatalogText(text, vendor || "Инмедиз");
    items = a.length >= b.length ? a : b;
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name}|${item.unitPrice}|${item.unitPriceSterile ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parsePricelistPdfBuffer(
  buffer: Buffer,
  options: { vendor?: string; fileName?: string } = {}
): Promise<ParsedSupplierPriceItem[]> {
  const { extractTextFromPdfBuffer } = await import("@/lib/pdfText");
  const text = await extractTextFromPdfBuffer(buffer);
  if (!text || text.length < 50) return [];
  return parsePricelistText(text, options);
}

/**
 * Номенклатура из ТЗ: отделение «что поставить» от «какие параметры».
 */

import {
  looksLikeProductName,
  isGenericProcurementTitle,
  isGenericConsumablesAccessoryLine,
  isCharacteristicFieldName,
  isServiceProcurement,
  isWorksProcurement,
  isPharmaceuticalProcurement,
  titleConflictsWithTzProducts,
} from "@/lib/tzSanitizer";
import { isKtruCode, TZ_POSITION_LINE_RE, TZ_POSITION_NUM_RE } from "@/lib/textNormalize";

export { isCharacteristicFieldName };

const PRODUCT_INFERENCE: Array<{ patterns: RegExp[]; name: string }> = [
  {
    patterns: [/перчат|латекс|манжет|неопудрен|текстурирован|порошков|диагностическ/i],
    name: "Перчатки медицинские",
  },
  {
    patterns: [/отходов\s+класса|мешк.*отход|медицинских\s+отходов|класса\s+[«"]?[абв]/i],
    name: "Мешки для медицинских отходов",
  },
  {
    patterns: [/шприц|игл[аы]\s+инъек/i],
    name: "Шприцы медицинские",
  },
  {
    patterns: [/неткан|спанбонд|смс\s+материал|мельтблаун/i],
    name: "Материал нетканый медицинский",
  },
  {
    patterns: [/бель[её]\s+медицин|комплект\s+бель|простын|наволоч|операционн.*бель/i],
    name: "Комплект белья медицинского",
  },
  {
    patterns: [/бинт\s+неткан|нетканый\s+бинт/i],
    name: "Бинт нетканый медицинский",
  },
  {
    patterns: [/эндопротез|ножк[аи]\s+бесцемент|травматолог/i],
    name: "Эндопротез травматологический",
  },
  {
    patterns: [/салфетк|марл(?!ев)|повязк/i],
    name: "Салфетки / перевязочные материалы",
  },
  {
    patterns: [/маск[аиуыей]?\s+хирург/i, /\bмаск[аиуыей]?\b.*медицин/i],
    name: "Маска хирургическая одноразовая",
  },
  {
    patterns: [/шапочк/i, /колпак\s+хирург/i],
    name: "Шапочка хирургическая одноразовая",
  },
  {
    patterns: [/чехол\s+хирург|чехол\s+неткан|чехол\s+прозрач/i, /материал\s+чехла/i],
    name: "Чехол хирургический одноразовый",
  },
  {
    patterns: [/простын.*инструмент|простын.*оборудован|простын.*стерильн/i],
    name: "Простыня для инструментов/оборудования одноразовая",
  },
  {
    patterns: [/халат\s+операцион|халат\s+медицин|халат\s+хирург|халат\s+стерильн/i],
    name: "Халат медицинский",
  },
  {
    patterns: [/халат|бахил|шапоч/i],
    name: "Средства индивидуальной защиты (медтекстиль)",
  },
  {
    patterns: [/катетер|зонд|канюл/i],
    name: "Катетеры медицинские",
  },
];

function extractProductFromSpecPrefix(spec: string): string | null {
  const m = spec.match(/^(.+?)\s+[—–-]\s+/);
  if (!m) return null;
  const name = m[1].trim();
  if (looksLikeProductName(name) && !isCharacteristicFieldName(name)) return name;
  return null;
}

function blobFromRequirements(input: {
  tzProducts?: string[];
  productSpecs?: string[];
  technicalAssignment?: string;
}): string {
  return [
    ...(input.tzProducts || []),
    ...(input.productSpecs || []),
    input.technicalAssignment || "",
  ]
    .join(" ")
    .toLowerCase();
}

function extractPrimaryProductFromTitle(title: string): string | null {
  const clean = title.replace(/^поставка\s+/i, "").trim();

  const parens = clean.match(/\(([^)]+)\)/);
  if (parens) {
    const inner = parens[1].replace(/\s+/g, " ").trim();
    if (/халат|маск|бинт|салфет|бахил|перчат|простын|бель|футболк|сувенир|текстил/i.test(inner)) {
      return inner.slice(0, 100);
    }
  }

  if (/футболк/i.test(clean)) {
    const shirt = clean.match(/футболк[\w]*/i)?.[0];
    if (shirt) return shirt.charAt(0).toUpperCase() + shirt.slice(1);
  }

  if (/сувенир/i.test(clean) && /текстил/i.test(clean)) {
    return clean.replace(/^изготовление\s+и\s+поставка\s+/i, "").slice(0, 100);
  }

  const mask = clean.match(/маск[аиуыей]?\s+хирургическ[\w]*/i);
  if (mask) return "Маска хирургическая одноразовая";

  const maskSimple = clean.match(/\bмаск[аиуыей]?\b/i);
  if (maskSimple && /медицин|хирург|однораз/i.test(clean)) {
    return "Маска медицинская одноразовая";
  }

  const gown = clean.match(/халат\s+[\w\s]{0,40}/i);
  if (gown) return gown[0].replace(/\s+/g, " ").trim().slice(0, 80);

  const kit = clean.match(/комплект[\w\s,.«»()-]{4,80}/i);
  if (kit) return kit[0].replace(/\s+/g, " ").trim().slice(0, 100);

  return null;
}

/** Восстановить наименование изделия по характеристикам и заголовку */
export function inferProductsFromTzData(
  input: {
    tzProducts?: string[];
    productSpecs?: string[];
    technicalAssignment?: string;
  },
  tenderTitle?: string
): string[] {
  const found = new Set<string>();
  const hasTzProducts = (input.tzProducts || []).some(
    (p) => looksLikeProductName(p) && !p.includes(" — ")
  );

  for (const p of input.tzProducts || []) {
    if (
      looksLikeProductName(p) &&
      !isCharacteristicFieldName(p) &&
      !isGenericProcurementTitle(p) &&
      !p.includes(" — ")
    ) {
      found.add(p);
    }
  }

  if (!hasTzProducts) {
    for (const spec of input.productSpecs || []) {
      if (isServiceProcurement(spec) || isWorksProcurement(spec)) continue;
      if (TZ_POSITION_LINE_RE.test(spec) && !TZ_POSITION_NUM_RE.test(spec)) {
        const name = spec.replace(/^Позиция\s*ТЗ\s*:\s*/i, "").trim();
        if (looksLikeProductName(name)) found.add(name);
        continue;
      }
      const colonProduct = spec.match(/^(.+?):\s*(соответствие|наличие|отсутствие|да|нет)\s*$/i);
      if (colonProduct) {
        const name = colonProduct[1].trim();
        if (looksLikeProductName(name) && !isCharacteristicFieldName(name)) {
          found.add(name);
        }
      }
      const numbered = spec.match(/^\d+\)\s*(.+?)(?:,\s*шт:|:\s*[\d.,]+)/i);
      if (numbered) {
        const name = numbered[1].replace(/,\s*шт$/i, "").trim();
        if (looksLikeProductName(name) && !isCharacteristicFieldName(name)) {
          found.add(name);
        }
      }
      const prefix = extractProductFromSpecPrefix(spec);
      if (prefix && !prefix.includes(" — ")) found.add(prefix);
    }
  }

  const blob = blobFromRequirements(input);
  if (found.size === 0) {
    for (const rule of PRODUCT_INFERENCE) {
      if (rule.patterns.some((re) => re.test(blob))) {
        found.add(rule.name);
      }
    }
  }

  if (found.size === 0 && tenderTitle) {
    if (isPharmaceuticalProcurement(tenderTitle)) {
      return [];
    }
    const primary = extractPrimaryProductFromTitle(tenderTitle);
    if (primary) {
      found.add(primary);
    } else {
      const titleClean = tenderTitle.replace(/^поставка\s+/i, "").trim();
      if (
        looksLikeProductName(titleClean) &&
        !isServiceProcurement(titleClean) &&
        !isWorksProcurement(titleClean) &&
        !isPharmaceuticalProcurement(titleClean) &&
        !/^медицинских\s+изделий/i.test(titleClean)
      ) {
        found.add(titleClean);
      }
    }
  }

  return [...found];
}

export function resolveProcurementProductNames(
  input: {
    tzProducts?: string[];
    productSpecs?: string[];
    technicalAssignment?: string;
    tzVolumes?: Array<{ name?: string; position?: string }>;
  },
  tenderTitle?: string
): string[] {
  const volumes = input.tzVolumes || [];
  if (volumes.length > 1) {
    const fromVolumes = [...volumes]
      .sort((a, b) => parseInt(a.position || "0", 10) - parseInt(b.position || "0", 10))
      .map((v) => v.name || "")
      .filter((p) => p.length >= 6 && !isKtruCode(p));
    if (fromVolumes.length > 0) return fromVolumes.slice(0, 80);
  }

  const fromTz = (input.tzProducts || []).filter(
    (p) =>
      p.length >= 8 &&
      !isCharacteristicFieldName(p) &&
      !isGenericProcurementTitle(p) &&
      !isGenericConsumablesAccessoryLine(p) &&
      !p.includes(" — ") &&
      !/^объём закупки/i.test(p)
  );

  if (fromTz.length === 0 && tenderTitle) {
    const fromTitle = extractPrimaryProductFromTitle(tenderTitle);
    if (fromTitle && fromTitle.length >= 6) return [fromTitle];
    const clean = tenderTitle
      .replace(/^изготовление\s+и\s+поставка\s+/i, "")
      .replace(/^поставка\s+/i, "")
      .trim();
    if (clean.length >= 8 && !isGenericConsumablesAccessoryLine(clean)) return [clean.slice(0, 120)];
  }

  if (tenderTitle && titleConflictsWithTzProducts(tenderTitle, fromTz)) {
    const fromTitle = extractPrimaryProductFromTitle(tenderTitle);
    if (fromTitle && fromTitle.length >= 6) return [fromTitle];
    const clean = tenderTitle.replace(/^изготовление\s+и\s+поставка\s+/i, "").replace(/^поставка\s+/i, "").trim();
    if (clean.length >= 8) return [clean.slice(0, 120)];
  }

  if (fromTz.length > 1) return fromTz.slice(0, 80);
  if (fromTz.length === 1) return fromTz;

  const fromSpecs: string[] = [];
  for (const spec of input.productSpecs || []) {
    if (TZ_POSITION_LINE_RE.test(spec) && !TZ_POSITION_NUM_RE.test(spec)) {
      const name = spec.replace(/^Позиция\s*ТЗ\s*:\s*/i, "").trim();
      if (name && !/^объём/i.test(name) && !isKtruCode(name)) fromSpecs.push(name);
    }
  }
  if (fromSpecs.length > 0) return fromSpecs.slice(0, 80);

  const direct = inferProductsFromTzData(input, tenderTitle).filter(
    (p) => !isCharacteristicFieldName(p) && !p.includes(" — ")
  );
  return [...new Set(direct)].slice(0, 40);
}

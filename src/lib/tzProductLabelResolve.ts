/**
 * Восстановление человекочитаемого названия позиции ТЗ вместо «Позиция 2 (поз. 2)».
 */

import { isKtruCode } from "@/lib/textNormalize";
import { repairFragmentedRussian } from "@/lib/textNormalize";
import { isPlaceholderPositionName, looksLikeProductName } from "@/lib/tzSanitizer";
import { parseTzPositionName } from "@/lib/textNormalize";

const EQUIPMENT_TITLE_KEYWORDS =
  /рентген|томограф|ультразвук|узи|эндоскоп|дефибрилл|вентилятор|анестез|стерилиз|лазер|маммограф|флюорограф|диагност|монитор\s+пациент/i;

/** Одно изделие из заголовка: медоборудование в скобках или текстиль «шапочек и фартуков» */
export function extractSingleProductFromTenderTitle(title: string): string | null {
  if (!title?.trim()) return null;

  const multi = extractProductsFromTenderTitle(title);
  if (multi.length === 1) return multi[0];

  const equipParen = title.match(
    /\(\s*((?:Система|Аппарат|Комплекс|Установка|Стойка|Стол)\s+[^)]{10,220}?)\s*\)/i
  );
  if (equipParen) {
    const name = repairFragmentedRussian(equipParen[1].replace(/\s+/g, " ").trim());
    if (name.length >= 12) return name;
  }

  const medParen = title.match(/медицинских\s+изделий\s*\(\s*([^)]+)/i);
  if (medParen) {
    let name = repairFragmentedRussian(
      medParen[1]
        .replace(/\s*\)\s*ввод.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (
      name.length >= 12 &&
      EQUIPMENT_TITLE_KEYWORDS.test(name) &&
      !/ввод в эксплуатацию|обучение правилам|техническое обслуживание/i.test(name)
    ) {
      return name;
    }
  }

  const anyParen = title.match(/\(([^()]{12,220})\)/);
  if (anyParen) {
    let name = repairFragmentedRussian(
      anyParen[1]
        .replace(/\s*\)\s*ввод.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (
      name.length >= 12 &&
      EQUIPMENT_TITLE_KEYWORDS.test(name) &&
      !/ввод в эксплуатацию|обучение|обслуживание/i.test(name)
    ) {
      return name;
    }
  }

  return null;
}

/** Из заголовка закупки: «шапочек … и фартуков …» → список изделий */
export function extractProductsFromTenderTitle(title: string): string[] {
  const clean = title
    .replace(/^поставка\s+/i, "")
    .replace(/\([^)]{0,120}\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const andSplit = clean.split(/\s+и\s+/i);
  if (andSplit.length >= 2) {
    const items: string[] = [];
    for (const part of andSplit) {
      const noun = part.match(
        /(шапоч\w*|фартук\w*|халат\w*|бахил\w*|маск\w*|перчат\w*|простын\w*|костюм\w*|туалет\w*|трус\w*|нарукавник\w*)/i
      );
      if (noun) {
        const idx = part.toLowerCase().indexOf(noun[0].toLowerCase());
        const fragment = part.slice(Math.max(0, idx)).trim();
        if (fragment.length >= 8) items.push(fragment.charAt(0).toUpperCase() + fragment.slice(1));
      }
    }
    if (items.length >= 2) return items;
  }

  const paren = title.match(/\(([^)]+)\)/);
  if (paren && /фартук|шапоч|халат|текстил/i.test(paren[1])) {
    return paren[1].split(/[,;]/).map((s) => s.trim()).filter((s) => s.length >= 5);
  }

  return [];
}

export function buildKtruNameMapFromSpecs(productSpecs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentKtru = "";
  let currentPos = "";

  for (const raw of productSpecs) {
    const spec = raw.trim();
    const ktruM = spec.match(/^КТРУ:\s*(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})/i);
    if (ktruM) {
      currentKtru = ktruM[1];
      continue;
    }
    const posName = parseTzPositionName(spec);
    if (posName && currentKtru && looksLikeProductName(posName) && !isPlaceholderPositionName(posName)) {
      map.set(currentKtru, posName.replace(/\s*\(поз\.?\s*\d+\)\s*$/i, "").trim());
    }
    const posNum = spec.match(/^Позиция\s*ТЗ\s*№:\s*(\d+)/i)?.[1];
    if (posNum) currentPos = posNum;
    const dash = spec.match(/^(.+?)\s+—\s+/);
    if (dash && currentKtru) {
      const product = dash[1].replace(/\s*\(поз\.?\s*\d+\)\s*$/i, "").trim();
      if (looksLikeProductName(product) && !isPlaceholderPositionName(product)) {
        map.set(currentKtru, product);
        if (currentPos) map.set(`pos:${currentPos}`, product);
      }
    }
  }
  return map;
}

export function resolveTzProductLabel(input: {
  name: string;
  ktruCode?: string;
  position?: string;
  tenderTitle?: string;
  ktruNameMap?: Map<string, string>;
}): string {
  let name = input.name?.trim() || "";
  if (isKtruCode(name)) name = "";

  if (name && looksLikeProductName(name) && !isPlaceholderPositionName(name)) {
    return name.replace(/\s*\(поз\.?\s*\d+\)\s*$/i, "").trim();
  }

  const map = input.ktruNameMap;
  if (map && input.ktruCode && map.has(input.ktruCode)) {
    return map.get(input.ktruCode)!;
  }
  if (map && input.position && map.has(`pos:${input.position}`)) {
    return map.get(`pos:${input.position}`)!;
  }

  const titleProducts = input.tenderTitle ? extractProductsFromTenderTitle(input.tenderTitle) : [];
  const posIdx = input.position ? parseInt(input.position, 10) - 1 : -1;
  if (posIdx >= 0 && titleProducts[posIdx]) {
    return titleProducts[posIdx];
  }

  if (input.ktruCode && /00000009\b/.test(input.ktruCode)) {
    return "Фартук гигиенический, одноразового использования";
  }
  if (input.ktruCode && /0000017[56]\b/.test(input.ktruCode)) {
    return "Шапочка хирургическая, одноразового использования, нестерильная";
  }

  const fromTitle = input.tenderTitle ? extractSingleProductFromTenderTitle(input.tenderTitle) : null;
  if (
    fromTitle &&
    (!name || isPlaceholderPositionName(name) || !looksLikeProductName(name) || name.length < 12)
  ) {
    return fromTitle;
  }

  return name || `Позиция ${input.position || "?"}`;
}

/** Подставить реальные названия вместо «Позиция N» при импорте/репарсе */
export function applyResolvedTzNames(
  details: {
    title?: string;
    productSpecs?: string[];
    tzProducts?: string[];
    tzVolumes?: Array<{
      name: string;
      ktruCode?: string;
      quantity: number;
      unit: string;
      position?: string;
    }>;
  }
): void {
  const title = details.title?.trim();
  if (!title) return;
  const specs = details.productSpecs || [];
  const map = buildKtruNameMapFromSpecs(specs);

  if (details.tzVolumes?.length) {
    details.tzVolumes = details.tzVolumes.map((v) => ({
      ...v,
      name: resolveTzProductLabel({
        name: v.name,
        ktruCode: v.ktruCode,
        position: v.position,
        tenderTitle: title,
        ktruNameMap: map,
      }),
    }));
  }

  if (details.tzProducts?.length) {
    details.tzProducts = details.tzProducts.map((p, i) =>
      resolveTzProductLabel({
        name: p,
        ktruCode: details.tzVolumes?.[i]?.ktruCode,
        position: details.tzVolumes?.[i]?.position || String(i + 1),
        tenderTitle: title,
        ktruNameMap: map,
      })
    );
  }
}

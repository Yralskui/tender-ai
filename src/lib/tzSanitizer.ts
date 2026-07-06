/**
 * Фильтрация мусора из ТЗ: юридические формулировки проекта контракта ≠ номенклатура.
 */

import type { TzParseResult } from "@/lib/tzParser";
import {
  isKtruCode,
  normalizeTzSpecText,
  stripKtruCode,
  TZ_POSITION_LINE_RE,
  TZ_POSITION_NUM_RE,
} from "@/lib/textNormalize";

/** Строка похожа на юридический/договорной шаблон, а не на изделие */
const LEGAL_BOILERPLATE: RegExp[] = [
  /процентов\s+(цен|начальн|контракт|этап)/i,
  /начальн[аяой]+\s*\(?\s*максимальн/i,
  /части\s+\d+\s+статьи/i,
  /стать[еяи]\s+\d+/i,
  /приложени[яе]\s+к\s+контракту/i,
  /проект\s+контракта/i,
  /настоящ(ий|его|ем)\s+контракт/i,
  /порядок\s+приемки/i,
  /обеспечение\s+исполнения/i,
  /федеральн(ый|ого)\s+закон/i,
  /един(ая|ой)\s+информационн/i,
  /информационн[аяой]+\s+систем/i,
  /штраф|неустойк|санкци/i,
  /арбитражн/i,
  /государственн[аяой]+\s+закупк/i,
  /заказчик\s+обязуется/i,
  /поставщик\s+обязуется/i,
  /срок\s+исполнения\s+контракта/i,
  /передач[аи]\s+товар/i,
  /документ\s+о\s+приемке/i,
  /оплат[аы]\s+по\s+контракту/i,
  /^\d+\s*%\s/,
  /^\d+\s*\.?\s*процент/i,
  /не\s+может\s+превышать/i,
  /в\s+соответствии\s+с\s+законодательством/i,
  /требовани[яе]\s+к\s+содержанию/i,
  /инструкция\s+по\s+заполнению/i,
  /участник\s+закупки/i,
  /оцениваются\s+при\s+рассмотрении/i,
];

/** Закупка услуг / работ — не номенклатура изделий */
const SERVICE_PROCUREMENT_PATTERNS: RegExp[] = [
  /оказани[ея]\s+услуг/i,
  /предоставлени[ея]\s+услуг/i,
  /выполнени[ея]\s+работ/i,
  /оказани[ея]\s+работ/i,
  /услуг[иа]?\s+по\b/i,
  /медицинск\w*\s+осмотр/i,
  /профилактическ\w*\s+осмотр/i,
  /периодическ\w*\s+осмотр/i,
  /предварительн\w*\s+осмотр/i,
  /диспансеризац/i,
  /аренд[аы]\b/i,
  /техническ\w*\s+обслуживан/i,
  /содержани[ея]\s+и\s+эксплуатац/i,
  /организаци[яи]\s+и\s+проведени/i,
  /консультационн\w*\s+услуг/i,
  /лабораторн\w*\s+исследован/i,
  /санитарно[-\s]?гигиеническ/i,
  /уборк[аи]\s+помещен/i,
  /дератизац|дезинсекц|дезинфекц/i,
  /транспортировк[аи]\s+пациент/i,
  /обучени[ея]\s+персонал/i,
];

export type ProcurementKind = "goods" | "service" | "works" | "unknown";

export function isServiceProcurement(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) return false;
  return SERVICE_PROCUREMENT_PATTERNS.some((re) => re.test(t));
}

export function isWorksProcurement(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /выполнени[ея]\s+работ|строительн\w*\s+работ|капитальн\w*\s+ремонт|монтажн\w*\s+работ/i.test(t);
}

/** Признаки реальной номенклатуры (изделие, препарат, расходник) */
const PRODUCT_NOUNS: RegExp[] = [
  /перчат/i, /шприц/i, /бинт/i, /салфет/i, /\bбель/i, /халат/i, /маск/i,
  /мешк/i, /пакет/i, /контейнер/i, /бахил/i, /простын/i, /фартук/i, /трус/i,
  /катетер/i, /игл/i, /наволоч/i, /чехол/i, /жгут/i, /шовн/i, /скальпел/i, /зонд/i,
  /издели/i, /аппарат/i, /оборудован/i, /препарат/i, /раствор/i, /ампул/i,
  /неткан/i, /полотн/i, /марл/i, /повязк/i, /пластыр/i, /калоприемник/i,
  /шпатель/i, /воротник/i, /одежд/i, /колпач/i, /шапоч/i, /набор\s+бель/i, /комплект/i,
  /нарукавник/i, /берет/i, /костюм/i,
  /рентген/i, /томограф/i, /ультразвук/i, /дефибрилл/i, /вентилятор/i, /эндоскоп/i,
  /маммограф/i, /флюорограф/i, /диагност/i,
];

const PRODUCT_SIGNALS: RegExp[] = [
  /издели/i,
  /бель[её]/i,
  /неткан/i,
  /шприц/i,
  /перчат/i,
  /салфет/i,
  /бинт/i,
  /халат/i,
  /маск/i,
  /катетер/i,
  /аппарат/i,
  /оборудован/i,
  /лекарственн/i,
  /препарат/i,
  /штука|шт\.|упаковк[аи]\s+(товара|продукц)|комплект\s+бель/i,
  /набор\s+бель/i,
  /шапоч/i,
  /фартук/i,
  /трус/i,
  /рентген/i,
  /томограф/i,
  /система\s+.*диагност/i,
  /ультразвук/i,
];

export function detectProcurementKind(...parts: Array<string | undefined | null>): ProcurementKind {
  const blob = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!blob) return "unknown";
  if (isServiceProcurement(blob)) return "service";
  if (isWorksProcurement(blob)) return "works";
  if (/поставк[аиу]|закупк[аи]\s+медицинск\w*\s+издел/i.test(blob)) return "goods";
  if (PRODUCT_NOUNS.some((re) => re.test(blob))) return "goods";
  return "unknown";
}

export function isLegalBoilerplate(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) return true;
  if (LEGAL_BOILERPLATE.some((re) => re.test(t))) return true;
  if (/^[\d\s.%]+$/.test(t)) return true;
  if (/^(п\.?\s*п\.?|№|n\s*o\.?)\s*$/i.test(t)) return true;
  return false;
}

const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^поставка\s+медицинских\s+изделий/i,
  /^поставка\s+изделий\s+медицин/i,
  /^поставка\s+медицинских\s+продуктов/i,
  /^поставка\s+медицинских\s+продуктов/i,
  /^медицинских\s+изделий\s+для/i,
  /^медицинских\s+продуктов\s+для/i,
  /по\s+ставка\s+изделий/i,
  /основные\s+характери\s*стики\s+объекта\s+закупки/i,
  /для\s+нужд\s+(университет|клиник|больниц|гбу|гбуз)/i,
  /для\s+обеспечения\s+деятельности/i,
];

export function isGenericProcurementTitle(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(t));
}

/** Сувениры, мерч, футболки — не медизделия из РУ */
const NON_MEDICAL_CONSUMER_PATTERNS: RegExp[] = [
  /сувенир/i,
  /\bфутболк/i,
  /\bтолстовк/i,
  /промо[\s-]?продукц/i,
  /брендирован/i,
  /\bмерч\b/i,
  /печать\s+на\s+(текстил|ткан)/i,
  /сублимаци/i,
  /изготовлени[ея]\s+и\s+поставк[аи]\s+сувенир/i,
  /туристическ.*продукц/i,
  /полиграфическ/i,
];

export function isNonMedicalConsumerTextileTender(...parts: Array<string | undefined | null>): boolean {
  const blob = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!blob) return false;
  return NON_MEDICAL_CONSUMER_PATTERNS.some((re) => re.test(blob));
}

/** Заголовок извещения и позиция из ТЗ противоречат друг другу */
export function titleConflictsWithTzProducts(title: string, tzProducts: string[]): boolean {
  if (!title?.trim() || tzProducts.length === 0) return false;
  const titleLower = title.toLowerCase();
  const consumerTitle = isNonMedicalConsumerTextileTender(title);
  const medicalKitInTitle = /набор\s+хирург|хирургическ.*(набор|комплект)/i.test(titleLower);

  for (const raw of tzProducts) {
    const p = raw.toLowerCase();
    if (consumerTitle && /набор\s+хирург|хирургическ.*(набор|комплект)/i.test(p) && !/футболк|сувенир/i.test(p)) {
      return true;
    }
    if (medicalKitInTitle && /футболк|сувенир|промо/i.test(p) && !/хирург|набор|комплект/i.test(p)) {
      return true;
    }
  }
  return false;
}

export function shouldBlockRuCatalogMatch(input: {
  tenderTitle?: string;
  tzProducts?: string[];
  nomenclatureMismatch?: boolean;
}): { blocked: boolean; reason: string } {
  if (input.nomenclatureMismatch) {
    return {
      blocked: true,
      reason: "Закупка не по вашей номенклатуре — позиции из РУ не подходят",
    };
  }
  if (isNonMedicalConsumerTextileTender(input.tenderTitle ?? "", ...(input.tzProducts || []))) {
    return {
      blocked: true,
      reason: "Сувенирная или промо-продукция — не медизделия из вашего РУ",
    };
  }
  if (titleConflictsWithTzProducts(input.tenderTitle ?? "", input.tzProducts || [])) {
    return {
      blocked: true,
      reason: "Название закупки не совпадает с позицией в ТЗ — нужна ручная проверка файла",
    };
  }
  return { blocked: false, reason: "" };
}

/** Шапка КТРУ-таблицы, ошибочно принятая за товар */
const TABLE_HEADER_AS_PRODUCT: RegExp[] = [
  /ктру\s*\/\s*окпд/i,
  /показател/i,
  /определени[яе]\s+соответств/i,
  /единица\s+измерения/i,
  /наименование\s+характеристик/i,
  /^показатели\s+для/i,
  /коэффициент\s+вариац/i,
  /цена\s+за\s+единицу/i,
  /обосновани[ея]\s+начальн/i,
  /средн[аяой]+\s+цена/i,
  /значение\s+характеристик/i,
];

export function isTableHeaderAsProduct(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 12) return false;
  return TABLE_HEADER_AS_PRODUCT.some((re) => re.test(t));
}

/** Лекарственный препарат — не медизделие из РУ */
export function isPharmaceuticalProcurement(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return (
    /лекарственн\w*\s+препарат/i.test(t) ||
    /\bмнн\s*[–—:-]/i.test(t) ||
    /\bжнвлп\b/i.test(t) ||
    /препарат\s+для\s+медицинск\w*\s+применен/i.test(t) ||
    /фармацевтическ\w*\s+субстанц/i.test(t)
  );
}

/** «Позиция 1», «Позиция 1 (поз. 1)» — заглушка, не название товара */
export function isPlaceholderPositionName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /^позици[яи]\s*\d+(\s*\(поз\.?\s*\d+\))?\.?$/i.test(t);
}

/** Характеристика, ошибочно принятая за название («Материал изделия: Спанбонд») */
export function isCharacteristicLabelAsName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (isPlaceholderPositionName(t)) return true;
  if (isCharacteristicFieldName(t)) return true;
  if (/^(материал|тип|способ|диаметр|размер|цвет|плотност|длина|ширина|хирургическ|стерильн)\b/i.test(t) && /:/.test(t)) {
    return true;
  }
  if (/^(берет|резинка|спанбонд|наличие|соответствие)$/i.test(t)) return true;
  if (/:/.test(t)) {
    const head = t.split(":")[0]?.trim() || "";
    if (head && isCharacteristicFieldName(head)) return true;
  }
  return false;
}

export function isCharacteristicFieldName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 4) return true;
  if (/остаточн.*срок|срок\s+годности|на\s+момент\s+поставки/i.test(t)) return true;
  if (/не\s+менее|не\s+более|больше\s+или\s+равно/i.test(t)) return true;
  if (/^(текстурирован|неопудрен|нестерильн|стерильн|цвет|материал|длина|ширина|размер|назначение|манжета|толщин|плотност)/i.test(t)) {
    return true;
  }
  if (/^(максимальн|минимальн|номинальн|управлен|мощност|напряжен|wi-?fi|модуль|автомат|дистанционн|комплект)/i.test(t)) {
    return true;
  }
  if (/соответствие\s*$/i.test(t) || /наличие\s*$/i.test(t)) return true;
  if (/^поставляется\b/i.test(t)) return true;
  if (/^в\s+стерильн/i.test(t)) return true;
  if (/^для\s+сбора.*отходов/i.test(t)) return true;
  return false;
}

/** «Комплектация расходными материалами» и похожие — не название изделия, а опция к оборудованию */
export function isGenericConsumablesAccessoryLine(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) return true;
  const lower = t.toLowerCase();
  if (/^комплектац/i.test(lower) && /расходн/i.test(lower)) return true;
  if (/^комплект\s+расходн/i.test(lower)) return true;
  if (
    /^расходн\w*\s+материал/i.test(lower) &&
    !/бахил|перчат|шприц|шапоч|маск|салфет|бинт|простын|халат|игл|катетер/i.test(lower)
  ) {
    return true;
  }
  if (/^поставк\w*\s+расходн/i.test(lower)) return true;
  return false;
}

export function isMaterialCompositionText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 20) return false;
  if (/^(шапоч|халат|простын|набор|комплект|салфет|маск|перчат|бахил|чехол)\b/i.test(t)) return false;
  return (
    /около\s+\d+\s*%/i.test(t) ||
    (/вискоза/i.test(t) && /полиэфир|полиэстер|полипропилен/i.test(t)) ||
    /этилен-винил-ацетат/i.test(t) ||
    (/впитывающ/i.test(t) && /полоск/i.test(t) && /%/.test(t))
  );
}

export function looksLikeProductName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 6 || t.length > 220) return false;
  if (isKtruCode(t)) return false;
  if (isPlaceholderPositionName(t)) return false;
  if (isTableHeaderAsProduct(t)) return false;
  if (isPharmaceuticalProcurement(t)) return false;
  if (isCharacteristicLabelAsName(t)) return false;
  if (isMaterialCompositionText(t)) return false;
  if (isLegalBoilerplate(t)) return false;
  if (isCharacteristicFieldName(t)) return false;
  if (isGenericProcurementTitle(t)) return false;
  if (isGenericConsumablesAccessoryLine(t)) return false;
  if (isServiceProcurement(t) || isWorksProcurement(t)) return false;
  const withoutKtru = stripKtruCode(t);
  if (withoutKtru.length >= 6 && withoutKtru !== t) {
    if (PRODUCT_NOUNS.some((re) => re.test(withoutKtru))) return true;
    if (PRODUCT_SIGNALS.some((re) => re.test(withoutKtru))) return true;
  }
  if (PRODUCT_NOUNS.some((re) => re.test(t))) return true;
  if (PRODUCT_SIGNALS.some((re) => re.test(t))) return true;
  return false;
}

export function isGarbageCharacteristic(spec: string): boolean {
  if (isLegalBoilerplate(spec)) return true;
  const norm = normalizeTzSpecText(spec);
  if (/^КТРУ:/i.test(norm)) return false;
  if (TZ_POSITION_LINE_RE.test(norm) || TZ_POSITION_NUM_RE.test(norm)) return false;
  if (/^Объём закупки:/i.test(norm)) return false;
  if (/регистрационн[ое]+\s+удостоверен/i.test(norm)) return false;
  if (
    /^(местонахождени|почтовый\s+адрес|адрес\s+электронн|e-?mail|номер\s+контактн|контактн\w*\s+телефон|фамилия,\s*имя|ответственн\w*\s+лиц)/i.test(
      norm
    )
  ) {
    return true;
  }
  if (/^полное\s+наименование(?::|\s|$)/i.test(norm)) return true;
  if (/:\s*(соответствие|наличие|отсутствие)\s*$/i.test(norm)) return true;
  if (/,\s*шт:\s*[\d.,]+$/i.test(norm) && !PRODUCT_NOUNS.some((re) => re.test(norm))) return true;
  if (/^количество\s+типоразмеров/i.test(norm)) return true;
  if (!isUsefulTzCharacteristic(norm)) return true;
  if (!norm.includes(":") && !norm.includes("—") && !norm.includes(" - ") && isCharacteristicFieldName(norm)) {
    return true;
  }
  if (norm.length > 180 && !PRODUCT_SIGNALS.some((re) => re.test(norm))) return true;
  if (/значение\s+характеристики\s+не\s+может\s+изменяться/i.test(norm)) return true;
  if (/^рентгенозащит/i.test(norm) && /\bда\b/i.test(norm)) return true;
  return false;
}

/** Характеристика пригодна для сверки (не вариант КТРУ «Соответствие» и не пустая единица измерения). */
export function isUsefulTzCharacteristic(spec: string, field?: string, value?: string): boolean {
  const norm = normalizeTzSpecText(spec);
  const dash = norm.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  const f = normalizeTzSpecText(field || (dash ? dash[2].split(":")[0] : norm.split(":")[0] || ""));
  const v = normalizeTzSpecText(
    value || (dash ? dash[2].includes(":") ? dash[2].split(":").slice(1).join(":") : dash[2] : norm.split(":").slice(1).join(":") || "")
  );

  if (!f && !v) return false;

  if (/значение\s+характеристики\s+не\s+может\s+изменяться/i.test(norm)) return false;

  // Длинное описание варианта изделия по КТРУ (не параметр для сверки)
  if (f.length > 85 && /хирургическ|для процедур|для операций|изготовлен|одноразов/i.test(f)) {
    return false;
  }

  const val = v.toLowerCase().trim();
  if (/^(да|нет)$/i.test(val) && (f.length > 45 || /^рентгенозащит/i.test(f))) return false;
  if (/^(соответствие|наличие|отсутствие)$/i.test(val)) {
    if (/\d/.test(f) || /не менее|не более|>=|<=/i.test(f) || /не менее|не более|>=|<=/i.test(norm)) {
      return true;
    }
    // КТРУ: параметр-утверждение (не заголовок варианта изделия)
    if (
      f.length >= 10 &&
      f.length <= 130 &&
      !/^(халат\s+хирургическ|халат\s+изготовлен|халат\s+должен|крой\s+халата|полностью\s+влагонепроницаем)/i.test(
        f
      )
    ) {
      return true;
    }
  if (f.length > 85 && /хирургическ|для процедур|для операций|изготовлен/i.test(f)) {
    return false;
  }
  if (/^соответствие/i.test(f) && f.length > 24) return false;
  if (/го\s+ст\s+en|гост\s+en/i.test(norm) && /^(соответствие|наличие)$/i.test(val)) return false;
    return false;
  }

  // Только единица без числа: «Длина завязок: см»
  if (/^(см|мм|грамм|кг|шт|м2|м²|%|штук|упак)$/i.test(val) && !/\d/.test(f) && !/\d/.test(norm)) {
    return false;
  }

  // Есть числовое требование — полезно
  if (/\d/.test(val) || />=|<=|не менее|не более|от\s+\d/i.test(f) || /от\s+\d/i.test(norm)) {
    return true;
  }

  // Короткие качественные (цвет, материал)
  if (f.length <= 55 && val.length >= 2 && !/^(см|грамм|шт)$/i.test(val)) {
    return true;
  }

  return false;
}

/** 0–100: насколько результат похож на настоящее ТЗ, а не на проект контракта */
export function scoreTzParseQuality(parsed: Pick<TzParseResult, "products" | "productSpecs">): number {
  const products = parsed.products || [];
  const specs = (parsed.productSpecs || []).filter((s) => !/^КТРУ:/i.test(s) && !/регистрационн/i.test(s));

  if (products.length === 0 && specs.length === 0) return 0;

  const validProducts = products.filter(looksLikeProductName);
  const validSpecs = specs.filter((s) => !isGarbageCharacteristic(s));

  const productRatio = products.length > 0 ? validProducts.length / products.length : 0;
  const specRatio = specs.length > 0 ? validSpecs.length / specs.length : 0;

  let score = 0;
  if (validProducts.length > 0) score += 30 + Math.min(40, validProducts.length * 8);
  if (validSpecs.length > 0) score += Math.min(30, validSpecs.length * 2);
  score += Math.round(productRatio * 20 + specRatio * 20);

  const garbageSpecs = specs.filter(isGarbageCharacteristic).length;
  if (garbageSpecs > 3 && garbageSpecs > validSpecs.length) score -= 40;
  if (validProducts.length === 0 && products.length > 0) score = Math.min(score, 15);
  if (validSpecs.length < 2 && specs.length > 0 && validProducts.length === 0) score = Math.min(score, 20);

  return Math.max(0, Math.min(100, score));
}

export function sanitizeTzParseResult(parsed: TzParseResult): TzParseResult {
  const multiVariant =
    (parsed.productBlocks?.length ?? 0) > 1 ||
    (parsed.tzVolumes?.length ?? 0) > 1 ||
    parsed.products.length > 1;

  const products = multiVariant
    ? [
        ...new Set(
          parsed.products
            .map(normalizeTzSpecText)
            .filter(
              (p) =>
                p.length >= 10 &&
                looksLikeProductName(p) &&
                !isCharacteristicFieldName(p) &&
                !isTableHeaderAsProduct(p) &&
                !isPharmaceuticalProcurement(p)
            )
        ),
      ]
    : [
        ...new Set(
          parsed.products
            .filter(looksLikeProductName)
            .map(normalizeTzSpecText)
            .filter(
              (p) =>
                !isCharacteristicFieldName(p) &&
                !isTableHeaderAsProduct(p) &&
                !isPharmaceuticalProcurement(p)
            )
        ),
      ];

  const productSpecs: string[] = [];
  const seen = new Set<string>();

  if (!multiVariant) {
    for (const p of products) {
      const line = `Позиция ТЗ: ${p}`;
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        productSpecs.push(line);
      }
    }
  }

  for (const raw of parsed.productSpecs) {
    const spec = normalizeTzSpecText(raw);
    if (!spec) continue;
    if (TZ_POSITION_LINE_RE.test(spec)) {
      const name = spec.replace(/^Позиция\s*ТЗ\s*:\s*/i, "").trim();
      if (isKtruCode(name)) continue;
      if (!multiVariant && !looksLikeProductName(name)) continue;
      if (multiVariant && name.length < 10) continue;
      productSpecs.push(spec);
      continue;
    }
    if (TZ_POSITION_NUM_RE.test(spec)) {
      productSpecs.push(spec);
      continue;
    }
    if (isGarbageCharacteristic(spec)) continue;
    if (multiVariant) {
      productSpecs.push(spec);
      continue;
    }
    const key = spec.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    productSpecs.push(spec);
  }

  if (parsed.hasRuRequirement && !productSpecs.some((s) => /ру|росздрав|регистрацион/i.test(s))) {
    productSpecs.unshift("Регистрационное удостоверение Росздравнадзора на медицинское изделие");
  }

  for (const code of parsed.ktruCodes.slice(0, 5)) {
    const line = `КТРУ: ${code}`;
    if (!seen.has(line.toLowerCase())) productSpecs.push(line);
  }

  const technicalAssignment = [
    products.length > 0 ? `Номенклатура из ТЗ: ${products.slice(0, 6).join("; ")}` : "",
    products.length > 0 ? `Характеристики из файла ТЗ` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    products,
    productSpecs: productSpecs.slice(0, 300),
    technicalAssignment,
    ktruCodes: parsed.ktruCodes,
    hasRuRequirement: parsed.hasRuRequirement,
    tzVolumes: parsed.tzVolumes,
    productBlocks: parsed.productBlocks,
  };
}

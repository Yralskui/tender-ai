/**
 * Вертикаль «поставщики медизделий» — фаза 1.
 * Позже сюда добавятся другие сегменты (general_goods, it, construction).
 */

import { isPharmaceuticalProcurement } from "@/lib/tzSanitizer";

export type ProductVertical = "medical" | "general";

/** ОКВЭД разделы, характерные для поставщиков медизделий */
export const MEDICAL_OKVED_SECTIONS = ["32", "21"] as const;

/** Торговля медизделиями */
export const MEDICAL_TRADE_OKVED = ["46.46", "46.69"] as const;

export const MEDICAL_TENDER_CATEGORIES = [
  "Медицинское оборудование",
  "Медоборудование",
  "Медрасходники",
  "Медицинские изделия",
  "Медизделия",
  "Нетканка",
  "Медбельё",
  "Медтекстиль",
  "Расходники",
  "По профилю",
] as const;

export const MEDICAL_KEYWORDS = [
  "медицин", "медиздел", "расходн", "шприц", "перчатк", "катетер", "бинт", "салфетк",
  "комплект", "стерильн", "хирург", "лаборатор", "диагност", "аптеч", "бельё", "белье",
  "изделие мед", "фср", "росздрав", "рзн", "регистрационн", "удостоверен",
  "неткан", "простын", "наволоч", "халат", "бахил", "марл", "перевяз", "операционн",
];

interface TenderLike {
  category: string;
  okvedCode?: string | null;
  title?: string;
  requirements?: string | {
    productSpecs?: string[];
    licenses?: string[];
    experience?: string;
  };
}

/** Поставщик медизделий по ОКВЭД (пустой профиль — считаем мед. вертикалью по умолчанию) */
export function isMedicalSupplier(okvedCodes: string[]): boolean {
  if (okvedCodes.length === 0) return true;
  return okvedCodes.some((code) => {
    const section = code.split(".")[0];
    if ((MEDICAL_OKVED_SECTIONS as readonly string[]).includes(section)) return true;
    if ((MEDICAL_TRADE_OKVED as readonly string[]).includes(code)) return true;
    return false;
  });
}

export function getCompanyVertical(okvedCodes: string[]): ProductVertical {
  return isMedicalSupplier(okvedCodes) ? "medical" : "general";
}

/** Медицинский тендер — по категории, ОКВЭД или содержимому ТЗ */
export function isMedicalTender(
  tender: TenderLike,
  requirements?: {
    productSpecs?: string[];
    licenses?: string[];
    experience?: string;
  }
): boolean {
  let reqs = requirements;
  if (!reqs) {
    if (typeof tender.requirements === "string") {
      try { reqs = JSON.parse(tender.requirements); } catch { reqs = {}; }
    } else {
      reqs = tender.requirements ?? {};
    }
  }
  const category = tender.category.toLowerCase();

  if (MEDICAL_TENDER_CATEGORIES.some((c) => category.includes(c.toLowerCase()))) return true;

  const okved = tender.okvedCode ?? "";
  if (okved.startsWith("32") || okved.startsWith("21") || okved.startsWith("86")) return true;

  const parsed = reqs ?? {};

  const text = [
    tender.title ?? "",
    ...(parsed.productSpecs ?? []),
    ...(parsed.licenses ?? []),
    parsed.experience ?? "",
  ].join(" ");

  if (isPharmaceuticalProcurement(text)) return false;

  const textLower = text.toLowerCase();

  return MEDICAL_KEYWORDS.some((kw) => textLower.includes(kw));
}

/** Фильтр ленты тендеров под вертикаль компании */
export function filterTendersForVertical<T extends TenderLike>(
  tenders: T[],
  okvedCodes: string[]
): T[] {
  if (!isMedicalSupplier(okvedCodes)) return tenders;
  return tenders.filter((t) => {
    let reqs: { productSpecs?: string[]; licenses?: string[]; experience?: string; tzProducts?: string[] } = {};
    if (typeof t.requirements === "string") {
      try { reqs = JSON.parse(t.requirements); } catch { reqs = {}; }
    } else if (t.requirements && typeof t.requirements === "object") {
      reqs = t.requirements;
    }
    const blob = [t.title ?? "", ...(reqs.tzProducts || []), ...(reqs.productSpecs || []).slice(0, 5)].join(" ");
    if (isPharmaceuticalProcurement(blob)) return false;
    return isMedicalTender(t, reqs);
  });
}

/** Реалистичные характеристики из ТЗ для медтендеров (паттерны zakupki.gov.ru) */
export const MEDICAL_PRODUCT_SPECS: Record<string, string[]> = {
  bed_linen: [
    "Комплект белья для операционных, стерильный, одноразового использования",
    "Регистрационное удостоверение Росздравнадзора (ФСР или РЗН) на каждую позицию",
    "Состав: простыня, наволочка, хирургический халат — по спецификации ТЗ",
    "Стерильная упаковка, срок годности не менее 12 месяцев на дату поставки",
    "Соответствие ГОСТ Р ИСО 11607-1 (упаковка стерильных медизделий)",
  ],
  consumables: [
    "Перчатки медицинские нитриловые, нестерильные, размер M/L",
    "Шприцы одноразовые 5 мл и 10 мл, трёхкомпонентные, с иглой",
    "Регистрационное удостоверение Росздравнадзора на каждую номенклатурную позицию",
    "Стерильные салфетки марлевые 16×14 см",
    "Катетер уретральный Foley, стерильный, силиконовый",
  ],
  equipment: [
    "Регистрационное удостоверение Росздравнадзора на каждую единицу оборудования",
    "Гарантийное обслуживание на территории РФ не менее 24 месяцев",
    "Обучение медицинского персонала работе с оборудованием",
    "Страна происхождения: РФ или из перечня дружественных стран",
    "Инструкция по эксплуатации на русском языке",
  ],
  dressings: [
    "Бинт марлевый медицинский стерильный 7×14 см",
    "Повязка адгезивная стерильная размером не менее 10×10 см",
    "РУ Росздравнадзора на каждую позицию номенклатуры",
    "Срок годности на дату поставки — не менее 18 месяцев",
  ],
};

export const MEDICAL_TZ_TEMPLATES: Record<string, string> = {
  bed_linen:
    "Поставка стерильных комплектов белья для операционных блоков согласно описанию объекта закупки (Приложение №1 к извещению на zakupki.gov.ru). Каждая позиция должна иметь действующее РУ Росздравнадзора. Поставщик указывает в заявке номер РУ и наименование изделия из приложения к удостоверению.",
  consumables:
    "Поставка медицинских расходных материалов по спецификации ТЗ. Обязательно наличие РУ на каждую позицию. Характеристики товара в заявке должны соответствовать извещению (ст. 33 44-ФЗ).",
  equipment:
    "Поставка медицинского оборудования с монтажом, пуско-наладкой и обучением персонала. РУ Росздравнадзора — обязательно. Технические характеристики — строго по КТРУ/описанию объекта закупки.",
  dressings:
    "Поставка перевязочных материалов и медицинских изделий для нужд стационара. Стерильность, срок годности и РУ — по каждой позиции спецификации.",
};

export const MEDICAL_TENDER_DOCUMENTS = [
  { name: "Извещение о проведении закупки", type: "notice", description: "Условия, сроки, обеспечение заявки" },
  { name: "Описание объекта закупки", type: "spec", description: "Характеристики медизделий по КТРУ / ст. 33 44-ФЗ" },
  { name: "Техническое задание (ТЗ)", type: "tz", description: "Номенклатура, РУ, стерильность, объёмы поставки" },
  { name: "Проект контракта", type: "contract_draft", description: "Сроки поставки, приёмка, штрафные санкции" },
];

export function pickMedicalSpecsVariant(index: number): keyof typeof MEDICAL_PRODUCT_SPECS {
  const keys = Object.keys(MEDICAL_PRODUCT_SPECS) as (keyof typeof MEDICAL_PRODUCT_SPECS)[];
  return keys[index % keys.length];
}

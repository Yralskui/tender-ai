/**
 * Семейства номенклатуры — чтобы не сопоставлять бельё с электродами и имплантами.
 */

export type ProductFamily =
  | "medical_textile"
  | "pharmaceutical"
  | "medical_implant_cardiac"
  | "medical_trauma_ortho"
  | "medical_electronic"
  | "medical_consumable"
  | "medical_lab_ivd"
  | "medical_equipment"
  | "medical_service"
  | "unknown";

const FAMILY_PATTERNS: Record<Exclude<ProductFamily, "unknown">, RegExp[]> = {
  medical_textile: [
    /бель/i, /бахил/i, /халат/i, /простын/i, /наволоч/i, /чехол/i, /неткан/i,
    /полотен/i, /шапоч/i, /берет/i, /шарлот/i, /одежд/i, /пеленк/i, /пелёнк/i,
    /маск/i, /салфетк/i, /простын/i, /покрывал/i,
  ],
  pharmaceutical: [
    /лекарственн/i, /препарат/i, /фармацевт/i, /\bмнн\b/i, /дозировк/i,
    /таблет/i, /капсул/i, /ампул/i, /раствор\s+для\s+инъек/i, /жнвлп/i,
    /фармакотерап/i, /абатацепт/i, /инсулин/i, /антибиотик/i,
    /мг\s*[/,]|мл\s*[/,]|\d+\s*мг\b|\d+\s*мл\b/i,
  ],
  medical_implant_cardiac: [
    /электрод/i, /кардиостимулятор/i, /электрокардиостимулятор/i, /имплантируем/i,
    /дефибриллятор/i, /сердечн.*ритм/i, /экс/i,
  ],
  medical_trauma_ortho: [
    /пластин/i, /остеосинтез/i, /блокировк/i, /зон[ыа]\s+рост/i,
    /\bвинт/i, /штифт/i, /спиц/i, /стержн/i, /гвозд/i, /накостн/i,
    /интрамедуллярн/i, /травматолог/i, /ортоопед/i, /тибиблок/i,
    /титанов/i, /титановый/i, /эндопротез/i, /костн.*фиксатор/i,
  ],
  medical_electronic: [
    /частот/i, /импульс/i, /полярност/i, /\bма\b/i, /миллиампер/i, /\bгц\b/i,
    /биполяр/i, /монополяр/i, /\bmri\b/i, /томограф/i, /монитор/i, /датчик/i,
    /сопротивлен/i, /емкост/i, /напряжен/i, /ток\s/i,
  ],
  medical_consumable: [
    /шприц/i, /игл\w*/i, /перчат/i, /катетер/i, /бинт/i, /шовн/i, /лигатур/i,
    /мешк.*отход/i, /отходов\s+класса/i, /медицинских\s+отходов/i,
    /коннектор/i, /крестообразн/i, /luer/i, /люер/i, /фитинг/i, /переходник/i, /адаптер/i,
  ],
  medical_lab_ivd: [
    /зонд/i, /пцр/i, /пцр-диагност/i, /микропробир/i, /пробирк/i,
    /биологическ\w*\s+образц/i, /транспортировк\w*\s+образц/i,
    /мазок\s+(из|носоглот)/i, /тампон\s+для\s+взят/i, /тампон\s+используется\s+для\s+взят/i,
    /инвитро/i, /соево-казеинов/i, /микробиолог\w*\s+посев/i,
  ],
  medical_equipment: [
    /аппарат/i, /оборудован/i, /установк/i, /сканер/i, /рентген/i, /узи\b/i,
    /стерилизатор/i, /анализатор/i,
    /устройств\w*\s+для\s+печат/i, /печат\w*\s+монохром/i, /медицинских\s+изображен/i,
    /принтер/i, /плоттер/i, /дижитайзер/i, /драй\s*фильм/i,
  ],
  medical_service: [
    /оказани[ея]\s+услуг/i, /услуг[иа]?\s+по\b/i, /медицинск\w*\s+осмотр/i,
    /диспансеризац/i, /аренд[аы]\b/i, /техническ\w*\s+обслуживан/i,
    /лабораторн\w*\s+исследован/i, /организаци[яи]\s+и\s+проведени/i,
  ],
};

/** Слова, которые дают ложные «частичные» совпадения между разными изделиями */
export const WEAK_MATCH_WORDS = new Set([
  "имплантации", "имплантация", "имплантацию", "имплантируемые", "имплантируемый",
  "хирургическ", "хирургического", "хирургический", "хирургические",
  "электро", "электрокардиос", "электрокардиостимулятор", "кардио", "сердечно",
  "медицинский", "медицинское", "медицинские", "медицинских", "медицинской", "медицинского",
  "медицинским", "медицинская", "медицинские", "стерильный", "стерильные",
  "комплект", "комплектом", "комплекта", "комплекте", "комплекту", "универсальный", "оборудования", "оборудование",
  "оказание", "услуг", "услуги", "осмотров", "осмотр", "проведению", "проведение",
  "клинической", "больницы", "скорой", "помощи", "нужд", "материала",
  "хирургическая", "хирургической", "хирургическую", "хирургическое",
  "одноразового", "одноразовая", "одноразовое", "использования", "использование",
  "наименование", "изделия", "изделий", "изделие", "процедурный", "процедурного",
  "универсальный", "универсальная", "универсальное", "универсальную", "универсальные",
  "упаковк", "упаковке", "упаковка", "индивидуальн", "индив", "стандарт", "бопп",
  "дерево", "хлопок", "хлопков", "тампон", "тампона", "образцов", "образца", "биологических",
  "транспортировки", "транспортировка", "используется", "используется",
]);

/** Узкие подтипы медтекстиля — маска ≠ халат */
export type TextileSubType =
  | "mask"
  | "gown"
  | "glove"
  | "shoe_cover"
  | "cap"
  | "sheet"
  | "linen_set"
  | "wipe"
  | "roll"
  | "apron"
  | "kit"
  | "generic_textile";

const TEXTILE_SUB_PATTERNS: Record<TextileSubType, RegExp[]> = {
  mask: [/\bмаск[аиуыей]?\b/i, /респиратор/i, /лицевой\s+покрыти/i],
  gown: [/\bхалат/i, /\bсорочк/i, /хирургическ.*сорочк/i, /комбинезон/i, /костюм\s+хирург/i],
  glove: [/перчат/i, /манжет/i],
  shoe_cover: [/бахил/i],
  cap: [/шапоч/i, /берет/i, /шарлот/i],
  sheet: [/простын/i, /пеленк/i, /пелёнк/i, /наволоч/i, /пододе/i],
  linen_set: [/комплект\s+бель/i, /набор\s+бель/i, /бель[её]\s+медицин/i, /бель[её]\s+для\s+(осмотр|хирург)/i, /постельн/i],
  wipe: [/салфет/i, /марл(?!ев)/i],
  roll: [/рулон/i],
  apron: [/фартук/i],
  kit: [/\bкомплект/i, /\bнабор/i],
  generic_textile: [/неткан/i, /спанбонд/i, /медтекстил/i],
};

/** Коннектор/фитинг — «колпачок» на соединении, не хирургическая шапочка */
export function isMedicalConnectorLine(text: string): boolean {
  const n = normalizeMatchText(text);
  if (/коннектор|крестообразн|luer|люер|фитинг|адаптер|переходник|муфт/i.test(n)) return true;
  if (/колпач/i.test(n) && /соединени|контур|пациент|male|female|\d+\s*мм|mm\b|luer|люер/i.test(n)) {
    return true;
  }
  if (/к\s+пациенту|к\s+контуру|тип\s+female|тип\s+male/i.test(n)) return true;
  return false;
}

/** Хирургическая шапочка/берет — текстиль, не деталь коннектора */
export function isSurgicalCapLine(text: string): boolean {
  if (isMedicalConnectorLine(text)) return false;
  const n = normalizeMatchText(text);
  if (/шапоч|берет|шарлот|колпак\s+хирург|головн|одноразов.*шап/i.test(n)) return true;
  return (
    /колпач/i.test(n) &&
    /хирург|голов|шапоч|берет|нетканый|стерильн/i.test(n) &&
    !/коннектор|соединени/i.test(n)
  );
}

export function detectTextileSubTypes(text: string): Set<TextileSubType> {
  const normalized = normalizeMatchText(text);
  const found = new Set<TextileSubType>();
  for (const [type, patterns] of Object.entries(TEXTILE_SUB_PATTERNS) as [
    TextileSubType,
    RegExp[],
  ][]) {
    if (type === "generic_textile") continue;
    if (patterns.some((re) => re.test(normalized))) found.add(type);
  }
  if (isSurgicalCapLine(text)) found.add("cap");
  if (found.size === 0 && isTextileProduct(text)) found.add("generic_textile");
  return found;
}

/** Маска, халат, перчатки — разные изделия, даже внутри «медтекстиля» */
export function textileSubTypesCompatible(
  tenderTypes: Set<TextileSubType>,
  catalogTypes: Set<TextileSubType>
): boolean {
  const specific = (s: Set<TextileSubType>) =>
    [...s].filter((t) => t !== "generic_textile");

  const t = specific(tenderTypes);
  const c = specific(catalogTypes);

  if (t.length === 0) return true;
  if (c.length === 0) return tenderTypes.has("kit");

  if (t.some((x) => c.includes(x))) return true;

  if (tenderTypes.has("kit") && catalogTypes.has("kit")) return true;

  if (t.includes("linen_set") && c.includes("gown") && !c.includes("linen_set")) return false;
  if (t.includes("gown") && c.includes("linen_set") && !t.includes("gown")) return false;

  return false;
}

export type SterilityPreference = "sterile" | "non_sterile" | "unknown";

export function parseSterilityPreference(text: string): SterilityPreference {
  const t = normalizeMatchText(text);
  if (/нестерил/i.test(t)) return "non_sterile";
  if (/стерил/i.test(t)) return "sterile";
  return "unknown";
}

export function sterilityPreferencesConflict(a: string, b: string): boolean {
  const sa = parseSterilityPreference(a);
  const sb = parseSterilityPreference(b);
  if (sa === "unknown" || sb === "unknown") return false;
  return sa !== sb;
}

/** Набор/комплект белья — не халат и не простыня по отдельности */
export function isMedicalLinenSetLine(text: string): boolean {
  const n = normalizeMatchText(text);
  return /набор\s+бель|комплект\s+бель|бель[её]\s+для\s+(осмотр|хирург)|бель[её]\s+медицин/i.test(n);
}

/** Хирургический костюм (рубашка + брюки) */
export function isSurgicalSuitLine(text: string): boolean {
  const n = normalizeMatchText(text);
  return /рубашк.*брюк|брюк.*рубашк|состав\s+костюма/i.test(n);
}


export function normalizeMatchText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\d\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function detectProductFamilies(text: string): Set<ProductFamily> {
  const found = new Set<ProductFamily>();
  const normalized = normalizeMatchText(text);

  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS) as [
    Exclude<ProductFamily, "unknown">,
    RegExp[],
  ][]) {
    if (patterns.some((re) => re.test(normalized))) {
      found.add(family);
    }
  }

  if (found.size === 0) found.add("unknown");
  return found;
}

/** Числовые параметры электроники/имплантов — не путать с размерами халата, г/м² и т.п. */
const TEXTILE_TZ_MARKERS =
  /плотност|г\/м|размер\s*\d|длина|ширина|высота|диаметр|толщин|обхват|манжет|рукав|халат|бель|салфет|простын|бахил|шапоч|чехол|неткан|спанбонд|микрон|мкм|см\b|мм\b|штук|комплект|набор/i;

const ELECTRONIC_TZ_MARKERS =
  /частот|импульс|полярност|гц\b|hz\b|миллиампер|\bма\b|мс\b|\bms\b|вольт|\bвт\b|напряжен|тока\b|сопротивлен|емкост|отслежив|электрод|стимулятор|кардио|дефибрилл|экг|эхо|имплант/i;

const ORTHO_TZ_MARKERS =
  /пластин|винт|штифт|тибиблок|титан|остеосинтез|блокировк|зон[ыа]\s+рост|накостн/i;

export function isTechnicalSpec(spec: string): boolean {
  const lower = spec.toLowerCase();
  if (ORTHO_TZ_MARKERS.test(lower)) return true;
  if (/длина\s+пластин|материал:\s*титан/i.test(lower)) return true;
  if (TEXTILE_TZ_MARKERS.test(lower)) return false;
  if (ELECTRONIC_TZ_MARKERS.test(lower)) return true;
  if (/\d+[\s,.]*(гц|hz|миллиампер|вольт|вт\b)/i.test(spec)) return true;
  return false;
}

export function isLabIvdLine(text: string): boolean {
  return FAMILY_PATTERNS.medical_lab_ivd.some((re) => re.test(normalizeMatchText(text)));
}

export function isTextileProduct(product: string): boolean {
  if (isMedicalConnectorLine(product)) return false;
  const normalized = normalizeMatchText(product);
  return FAMILY_PATTERNS.medical_textile.some((re) => re.test(normalized));
}

/** Одна позиция каталога — приоритет у типа изделия (бельё ≠ электрод, даже в названии «для ЭКС») */
export function classifyProductFamily(product: string): ProductFamily {
  const normalized = normalizeMatchText(product);

  if (isMedicalConnectorLine(product)) return "medical_consumable";

  if (FAMILY_PATTERNS.medical_trauma_ortho.some((re) => re.test(normalized))) {
    return "medical_trauma_ortho";
  }
  if (FAMILY_PATTERNS.medical_lab_ivd.some((re) => re.test(normalized))) {
    return "medical_lab_ivd";
  }
  if (isTextileProduct(product)) return "medical_textile";

  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS) as [
    Exclude<ProductFamily, "unknown">,
    RegExp[],
  ][]) {
    if (family === "medical_textile" || family === "medical_trauma_ortho") continue;
    if (patterns.some((re) => re.test(normalized))) return family;
  }
  return "unknown";
}

/** Семейство для строки сверки (название позиции ТЗ или каталога) */
export function familiesForMatchLine(line: string): Set<ProductFamily> {
  const classified = classifyProductFamily(line);
  if (classified !== "unknown") return new Set([classified]);
  return detectProductFamilies(line);
}

export function catalogFamiliesFromProducts(products: string[]): Set<ProductFamily> {
  const families = new Set<ProductFamily>();
  for (const p of products) {
    families.add(classifyProductFamily(p));
  }
  if (families.size === 0) families.add("unknown");
  return families;
}

/** Несовместимые пары семейств (тендер ↔ каталог) */
export function familiesAreCompatible(
  tenderFamilies: Set<ProductFamily>,
  catalogFamilies: Set<ProductFamily>
): boolean {
  const tenderKnown = [...tenderFamilies].filter((f) => f !== "unknown");
  const catalogKnown = [...catalogFamilies].filter((f) => f !== "unknown");

  if (tenderKnown.length === 0 || catalogKnown.length === 0) return true;

  const tenderCardiac =
    tenderFamilies.has("medical_implant_cardiac") || tenderFamilies.has("medical_electronic");
  const catalogTextile =
    catalogFamilies.has("medical_textile") &&
    !catalogFamilies.has("medical_implant_cardiac") &&
    !catalogFamilies.has("medical_electronic");
  const tenderTextile = tenderFamilies.has("medical_textile");

  if (tenderCardiac && catalogTextile && !tenderTextile) return false;

  const tenderPharma = tenderFamilies.has("pharmaceutical");
  if (tenderPharma && catalogTextile) return false;

  const catalogPharma = catalogFamilies.has("pharmaceutical");
  if (tenderTextile && catalogPharma) return false;

  const tenderEquipment = tenderFamilies.has("medical_equipment");
  if (tenderEquipment && catalogTextile && catalogKnown.length === 1) return false;
  if (tenderEquipment && catalogTextile && !tenderTextile && !catalogFamilies.has("medical_equipment")) {
    return false;
  }

  const tenderService = tenderFamilies.has("medical_service");
  const catalogGoods =
    catalogTextile ||
    catalogFamilies.has("medical_consumable") ||
    catalogFamilies.has("pharmaceutical");
  if (tenderService && catalogGoods && !tenderFamilies.has("medical_textile")) return false;

  const catalogCardiac =
    catalogFamilies.has("medical_implant_cardiac") || catalogFamilies.has("medical_electronic");
  if (tenderTextile && catalogCardiac && !tenderCardiac) return false;

  const tenderTrauma = tenderFamilies.has("medical_trauma_ortho");
  const catalogTrauma = catalogFamilies.has("medical_trauma_ortho");
  if (tenderTrauma && catalogTextile) return false;
  if (tenderTextile && catalogTrauma) return false;
  if (tenderTrauma && catalogCardiac && !tenderCardiac) return false;

  const tenderLab = tenderFamilies.has("medical_lab_ivd");
  if (tenderLab && catalogTextile) return false;
  if (tenderTextile && catalogFamilies.has("medical_lab_ivd")) return false;

  const tenderConsumable = tenderFamilies.has("medical_consumable");
  const catalogConsumable = catalogFamilies.has("medical_consumable");
  if (tenderConsumable && !tenderTextile && catalogTextile && !catalogConsumable) return false;

  return true;
}

export function describeTenderFamilies(families: Set<ProductFamily>): string {
  if (families.has("pharmaceutical")) return "лекарственные препараты";
  if (families.has("medical_trauma_ortho")) return "травматология / остеосинтез";
  if (families.has("medical_implant_cardiac") || families.has("medical_electronic")) {
    return "имплантируемые изделия / кардиостимуляция";
  }
  if (families.has("medical_textile")) return "медицинское бельё и текстиль";
  if (families.has("medical_service")) return "медицинские услуги";
  if (families.has("medical_consumable")) return "расходные материалы";
  if (families.has("medical_equipment")) return "медицинское оборудование";
  return "медизделия";
}

export function describeCatalogFamilies(families: Set<ProductFamily>): string {
  if (families.has("medical_trauma_ortho")) return "остеосинтез, пластины, винты";
  if (families.has("medical_textile")) return "бельё, бахилы, чехлы, текстиль";
  if (families.has("medical_implant_cardiac")) return "электроды и кардиостимуляция";
  if (families.has("medical_consumable")) return "расходники";
  if (families.has("medical_equipment")) return "оборудование";
  return "другая номенклатура";
}

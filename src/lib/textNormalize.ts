/** Декодирование HTML-сущностей из ЕИС / DOCX (&#8805; → ≥, &gt; → >) */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);/g, (_, code) => {
        const n = parseInt(code, 10);
        if (Number.isNaN(n) || n <= 0 || n > 0x10ffff) return _;
        try {
          return String.fromCodePoint(n);
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const n = parseInt(hex, 16);
        if (Number.isNaN(n) || n <= 0 || n > 0x10ffff) return _;
        try {
          return String.fromCodePoint(n);
        } catch {
          return _;
        }
      })
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    if (next === out) break;
    out = next;
  }

  return out;
}

/** Слова, которые нельзя «склеивать» с предыдущим фрагментом при восстановлении DOCX */
const REPAIR_NO_MERGE = new Set(
  "для из на при или не от по под над без см мм кг шт с в к у о а и да нет со об до за ли же бы ни про без два две три одной другой собой имеет должен более менее равно эквивалент тип типа пару ленты элементы квадратный наметр грамм процедур операций количеством жидкости отделяемой выделяемой изготовлен перекрывают фиксирующие материала завязок крючками петлями хирургический стерильный нестерильный тз №".split(
    " "
  )
);

/** Маркеры позиций ТЗ — не склеивать «Позиция» + «ТЗ» */
export const TZ_POSITION_LINE_RE = /^Позиция\s*ТЗ\s*:/i;
export const TZ_POSITION_NUM_RE = /^Позиция\s*ТЗ\s*№\s*:/i;

export function parseTzPositionName(spec: string): string | null {
  const m = spec.match(/^Позиция\s*ТЗ\s*:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

export function parseTzPositionNumber(spec: string): string | null {
  const m = spec.match(/^Позиция\s*ТЗ\s*№\s*:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Текст характеристики ТЗ для UI и сверки */
export function repairFragmentedRussian(text: string): string {
  let out = text;
  for (let i = 0; i < 6; i++) {
    const next = out.replace(
      /([а-яё])(\s+)([а-яё]{1,4})(?=[\s,.;:!?»«\-–—/]|$)/gi,
      (full, a: string, _sp: string, b: string) => {
        if (REPAIR_NO_MERGE.has(b.toLowerCase())) return full;
        return `${a}${b}`;
      }
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Разлепляет типичные склейки из DOCX/КТРУ: «стерильныйдля» → «стерильный для» */
export function unstickMergedRussian(text: string): string {
  const glueWords = [
    "воздухопроницаемого",
    "полипропиленового",
    "нестерильный",
    "стерильный",
    "хирургический",
    "изготовлен",
    "перекрывают",
    "фиксирующие",
    "элементы",
    "квадратный",
    "наметр",
    "процедур",
    "операций",
    "количеством",
    "отделяемой",
    "выделяемой",
    "текстильных",
    "крючками",
    "петлями",
    "материала",
    "завязок",
    "липучка",
    "одной",
    "друг",
    "друга",
    "собой",
    "имеет",
    "должен",
    "для",
    "из",
    "на",
    "при",
    "или",
    "тип",
    "типа",
  ];

  const shortGlue = new Set(["для", "из", "на", "при", "или", "не", "от", "по", "до", "за", "под", "над", "без", "про"]);

  let out = text;
  for (const w of glueWords.sort((a, b) => b.length - a.length)) {
    if (w.length <= 1) continue;
    const after = w.length <= 3 && shortGlue.has(w) ? String.raw`(?=[а-яё])` : w.length <= 3 ? String.raw`(?=\s|$|[,.;:—–-])` : String.raw`(?=[а-яё])`;
    const before = w.length >= 4 ? String.raw`([а-яё]{3,})` : String.raw`([а-яё]{5,})`;
    out = out.replace(new RegExp(`${before}(${w})${after}`, "gi"), "$1 $2");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 25.00000000000 → 25, 2.50000000000 → 2.5 */
export function cleanTzNumericNoise(text: string): string {
  return text
    .replace(/(\d+)\.(\d*?)0{4,}(?=\D|$)/g, (_, intPart: string, frac: string) => {
      if (!frac || /^0+$/.test(frac)) return intPart;
      const trimmed = frac.replace(/0+$/, "");
      return trimmed ? `${intPart}.${trimmed}` : intPart;
    })
    .replace(/\s+и\s*$/i, "")
    .replace(/\s+и\s*;\s*/g, "; ")
    .replace(/>\s*-\s*≤/g, "–")
    .replace(/>=\s*-\s*<=/g, "–");
}

export function normalizeTzSpecText(text: string): string {
  const protectedText = text.replace(/Позиция\s*ТЗ/gi, "Позиция ТЗ");

  let out = unstickMergedRussian(
    cleanTzNumericNoise(
      repairFragmentedRussian(
        decodeHtmlEntities(protectedText)
          .replace(/\u2265/g, ">=")
          .replace(/\u2264/g, "<=")
      )
    )
  )
    .replace(/\s+/g, " ")
    .trim();

  out = out
    .replace(/Соответ\s+ствие/gi, "Соответствие")
    .replace(/Плотно\s+сть/gi, "Плотность")
    .replace(/внахлё\s+ст/gi, "внахлёст")
    .replace(/перекрывают\s*друг/gi, "перекрывают друг")
    .replace(/Голубой\s*ил\s*и?\s*зеленый/gi, "Голубой или зеленый")
    .replace(/Голубойил\s*изеленый/gi, "Голубой или зеленый")
    .replace(/эла\s+стичной/gi, "эластичной")
    .replace(/полиэ\s+стровой/gi, "полиэстровой")
    .replace(/Дополнитель\s+ная/gi, "Дополнительная")
    .replace(/стерил\s+изаци/gi, "стерилизаци")
    .replace(/стерил\s+изационн/gi, "стерилизационн")
    .replace(/предназ\s+начен/gi, "предназначен")
    .replace(/Количествово/gi, "Количество во")
    .replace(/Липкийслой/gi, "Липкий слой")
    .replace(/Контролируемые режимы:/gi, "Контролируемые режимы: ")
    .replace(/Контрольные значения индикатора(\d)/gi, "Контрольные значения индикатора $1")
    .replace(/давление\s*пара/gi, "давление пара")
    .replace(/химиче\s+ский/gi, "химический")
    .replace(/Индивидуаль\s+ная/gi, "Индивидуальная")
    .replace(/прозрач\s+ная/gi, "прозрачная")
    .replace(/много\s+слой\s+ная/gi, "многослойная")
    .replace(/комбинирован\s+ная/gi, "комбинированная")
    .replace(/си\s+стемы/gi, "системы")
    .replace(/должнобыть/gi, "должно быть")
    .replace(/СоответствиеГО/gi, "Соответствие ГО")
    .replace(/со\s+стоящий/gi, "состоящий")
    .replace(/хирургиче\s+ский/gi, "хирургический")
    .replace(/количе\s+ством/gi, "количеством")
    .replace(/жидко\s+сти/gi, "жидкости")
    .replace(/нез\s+начительным/gi, "незначительным")
    .replace(/термиче\s+ски/gi, "термически")
    .replace(/в\s+обла\s+сти/gi, "в области")
    .replace(/фик\s+сирующие/gi, "фиксирующие")
    .replace(/возможно\s+стью/gi, "возможностью")
    .replace(/пред\s+ставляет/gi, "представляет")
    .replace(/тек\s+стильных/gi, "текстильных")
    .replace(/вы\s+сота/gi, "высота")
    .replace(/нижнемукраю/gi, "нижнему краю")
    .replace(/развернутомвиде/gi, "развернутом виде")
    .replace(/обе\s+спечить/gi, "обеспечить")
    .replace(/соединеныдруг/gi, "соединены друг")
    .replace(/Про\s+стыня/gi, "Простыня")
    .replace(/ин\s+струментов/gi, "инструментов")
    .replace(/стериль\s+ная/gi, "стерильная")
    .replace(/стериль\s+ный/gi, "стерильный");

  return out.replace(/\s+/g, " ").trim();
}

/** Полный код КТРУ: 14.12.30.190-00000020 */
export const KTRU_FULL_CODE_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/;

/** Строка — только код КТРУ (без названия изделия) */
export function isKtruCode(text: string): boolean {
  const t = text.trim().replace(/\s+/g, "");
  if (!t) return false;
  if (/^\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,}$/.test(t)) return true;
  const m = t.match(KTRU_FULL_CODE_RE);
  return Boolean(m && m[1] === t);
}

/** Убрать код КТРУ из строки, оставить наименование */
export function stripKtruCode(text: string): string {
  return text
    .replace(KTRU_FULL_CODE_RE, "")
    .replace(/\b\d{2}\.\d{2}\.\d{2}\.\d{3}\b/g, "")
    .replace(/,\s*-\d{5,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .trim();
}

export function normalizeDisplayText(text: string): string {
  return normalizeTzSpecText(text);
}

/** Нормализация ТЗ из БД (старые записи с &gt; / &lt; и разорванными словами) */
export interface StoredRequirements {
  productSpecs?: string[];
  tzProducts?: string[];
  tzVolumes?: Array<{
    name?: string;
    quantity: number;
    unit?: string;
    position?: string;
    ktruCode?: string;
  }>;
  technicalAssignment?: string;
}

import { deriveTzVolumesFromRequirements } from "@/lib/tzVolumes";

export function normalizeStoredRequirements<T extends StoredRequirements>(reqs: T): T {
  if (!reqs) return reqs;
  const out = { ...reqs };

  if (reqs.productSpecs?.length) {
    out.productSpecs = reqs.productSpecs.map(normalizeTzSpecText).filter(Boolean);
  }
  if (reqs.tzProducts?.length) {
    out.tzProducts = [
      ...new Set(
        reqs.tzProducts
          .map(normalizeTzSpecText)
          .filter((p) => p.length >= 6 && !/^(толщин|объём закупки|позици[яи]\s*\d)/i.test(p))
          .filter((p) => !/комплектац\w*\s+расходн/i.test(p))
      ),
    ];
  }
  if (reqs.tzVolumes?.length) {
    out.tzVolumes = reqs.tzVolumes.map((v) => ({
      ...v,
      name: v.name ? normalizeTzSpecText(v.name) : v.name,
    }));
  }
  if (typeof reqs.technicalAssignment === "string" && reqs.technicalAssignment.trim()) {
    out.technicalAssignment = normalizeTzSpecText(reqs.technicalAssignment);
  }

  const derivedVolumes = deriveTzVolumesFromRequirements(out);
  if (derivedVolumes.length > 0 && !(out.tzVolumes?.some((v) => v.quantity > 0))) {
    out.tzVolumes = derivedVolumes;
  }

  return out;
}

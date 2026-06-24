/**
 * Национальный режим (ст. 14 44-ФЗ, ПП РФ № 1875) — разбор извещения ЕИС и оценка для поставщика.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type NationalRegimeMeasure = "ban" | "restriction" | "preference";

export interface NationalRegimePosition {
  objectName: string;
  measures: NationalRegimeMeasure[];
  exemptionReason: string;
}

export interface NationalRegimeKtruHint {
  ktruCode: string;
  text: string;
}

export interface StoredNationalRegime {
  legalBasis: string;
  positions: NationalRegimePosition[];
  ktruHints: NationalRegimeKtruHint[];
  parsedAt?: string;
}

export interface NationalRegimeAnalysis {
  appliedMeasures: NationalRegimeMeasure[];
  catalogMeasures: NationalRegimeMeasure[];
  hasForeignOriginSpec: boolean;
  nmck: number;
  nmckUnder1M: boolean;
  maxUnitPrice: number | null;
  unitPriceUnder300k: boolean | null;
  exemptionPossible: boolean;
  exemptionDeclared: boolean;
  foreignParticipation: "allowed" | "restricted" | "banned" | "unknown";
  summary: string;
  details: string[];
  legalNote: string;
}

const MEASURE_PATTERNS: Array<{ measure: NationalRegimeMeasure; re: RegExp }> = [
  { measure: "ban", re: /запрет(?!\s+участия)/i },
  { measure: "restriction", re: /ограничен/i },
  { measure: "preference", re: /преимущество/i },
];

function decodeTooltip(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectMeasures(text: string): NationalRegimeMeasure[] {
  const measures = new Set<NationalRegimeMeasure>();
  for (const { measure, re } of MEASURE_PATTERNS) {
    if (re.test(text)) measures.add(measure);
  }
  return [...measures];
}

function extractNationalRegimeChunk(html: string): string {
  const start = html.search(/Применение национального режима по ст\.?\s*14/i);
  if (start < 0) return "";
  return html.slice(start, start + 20000);
}

/** Таблица «Применение национального режима» на common-info.html */
export function parseNationalRegimeFromNoticeHtml(html: string): StoredNationalRegime | null {
  const chunk = extractNationalRegimeChunk(html);
  if (!chunk) return null;

  const legalBasis =
    stripHtml(
      chunk.match(/Постановление Правительства[\s\S]{0,120}?1875/i)?.[0] ||
        "Постановление Правительства РФ от 23.12.2024 № 1875"
    ) || "ПП РФ № 1875";

  const positions: NationalRegimePosition[] = [];
  const rowRe = /<tr class="table__row">([\s\S]*?)<\/tr>/gi;
  for (const row of chunk.matchAll(rowRe)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripHtml(c[1]));
    if (cells.length < 2) continue;
    const objectName = cells[0]?.trim();
    const requirementText = cells[1]?.trim() || "";
    const exemptionReason = (cells[2] || "").trim();
    if (!objectName || objectName.length < 4) continue;
    if (/^объект закупки$/i.test(objectName)) continue;

    const measures = detectMeasures(requirementText);
    if (measures.length === 0) continue;

    positions.push({ objectName, measures, exemptionReason });
  }

  const ktruHints: NationalRegimeKtruHint[] = [];
  for (const m of html.matchAll(
    /(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,}|\d{2}\.\d{2}\.\d{2}\.\d{3})[\s\S]{0,400}?data-tooltip='[^']*custom-tooltiptext">([^<]+)/gi
  )) {
    const text = decodeTooltip(m[2]);
    if (!/запрет|ограничен|преимущество|иностран/i.test(text)) continue;
    ktruHints.push({ ktruCode: m[1], text });
  }

  if (positions.length === 0 && ktruHints.length === 0) return null;

  const dedupedPositions: NationalRegimePosition[] = [];
  const seenPos = new Set<string>();
  for (const pos of positions) {
    const key = `${pos.objectName}|${pos.measures.join(",")}`;
    if (seenPos.has(key)) continue;
    seenPos.add(key);
    dedupedPositions.push(pos);
  }

  const dedupedHints: NationalRegimeKtruHint[] = [];
  const seenHint = new Set<string>();
  for (const hint of ktruHints) {
    if (seenHint.has(hint.ktruCode)) continue;
    seenHint.add(hint.ktruCode);
    dedupedHints.push(hint);
  }

  return {
    legalBasis,
    positions: dedupedPositions,
    ktruHints: dedupedHints.slice(0, 12),
    parsedAt: new Date().toISOString(),
  };
}

function measureLabel(m: NationalRegimeMeasure): string {
  if (m === "ban") return "запрет иностранных товаров";
  if (m === "restriction") return "ограничение иностранных товаров";
  return "преимущество российским товарам";
}

function uniqueMeasures(list: NationalRegimeMeasure[]): NationalRegimeMeasure[] {
  const order: NationalRegimeMeasure[] = ["ban", "restriction", "preference"];
  const set = new Set(list);
  return order.filter((m) => set.has(m));
}

function estimateMaxUnitPrice(
  nmck: number,
  volumes?: Array<{ quantity: number; name?: string }>
): number | null {
  if (!volumes?.length) return nmck;
  const qtys = volumes.map((v) => v.quantity).filter((q) => q > 0);
  if (qtys.length === 0) return nmck;
  if (qtys.length === 1) return nmck / qtys[0];
  return nmck / Math.min(...qtys);
}

export function hasForeignOriginInSpecs(specs: string[]): boolean {
  return specs.some((s) =>
    /страна\s+происхожд|происхождения\s+товар|иностранн.*происхожд|российск.*происхожд|еаэс.*происхожд|сертификат.*происхожд|декларац.*происхожд/i.test(
      s
    )
  );
}

export function analyzeNationalRegime(
  stored: StoredNationalRegime | null | undefined,
  nmck: number,
  productSpecs: string[] = [],
  tzVolumes?: Array<{ quantity: number; name?: string }>
): NationalRegimeAnalysis {
  const appliedMeasures = uniqueMeasures(
    (stored?.positions || []).flatMap((p) => p.measures)
  );
  const catalogMeasures = uniqueMeasures(
    (stored?.ktruHints || []).flatMap((h) => detectMeasures(h.text))
  );

  const hasForeignOriginSpec = hasForeignOriginInSpecs(productSpecs);
  const nmckUnder1M = nmck > 0 && nmck <= 1_000_000;
  const maxUnitPrice = estimateMaxUnitPrice(nmck, tzVolumes);
  const unitPriceUnder300k =
    maxUnitPrice === null ? null : maxUnitPrice > 0 && maxUnitPrice <= 300_000;

  const hasBanOrRestriction =
    appliedMeasures.includes("ban") ||
    appliedMeasures.includes("restriction") ||
    catalogMeasures.includes("ban") ||
    catalogMeasures.includes("restriction");

  const exemptionDeclared = (stored?.positions || []).some((p) => p.exemptionReason.length > 8);

  const exemptionPossible =
    hasBanOrRestriction &&
    nmckUnder1M &&
    unitPriceUnder300k === true &&
    !appliedMeasures.includes("ban");

  let foreignParticipation: NationalRegimeAnalysis["foreignParticipation"] = "unknown";
  if (appliedMeasures.includes("ban")) foreignParticipation = "banned";
  else if (appliedMeasures.includes("restriction")) foreignParticipation = "restricted";
  else if (appliedMeasures.includes("preference")) foreignParticipation = "allowed";
  else if (catalogMeasures.includes("ban")) foreignParticipation = "restricted";
  else if (catalogMeasures.includes("restriction") || catalogMeasures.includes("preference")) {
    foreignParticipation = "allowed";
  }

  const details: string[] = [];

  if (stored?.positions.length) {
    for (const pos of stored.positions.slice(0, 6)) {
      const labels = pos.measures.map(measureLabel).join(", ");
      details.push(`В извещении (${pos.objectName.slice(0, 80)}): ${labels}`);
      if (pos.exemptionReason) {
        details.push(`Обоснование несоблюдения: ${pos.exemptionReason.slice(0, 240)}`);
      }
    }
  }

  if (stored?.ktruHints.length) {
    for (const hint of stored.ktruHints.slice(0, 4)) {
      const labels = detectMeasures(hint.text).map(measureLabel).join(", ");
      if (labels) details.push(`По каталогу КТРУ ${hint.ktruCode}: ${labels}`);
    }
  }

  if (hasForeignOriginSpec) {
    details.push(
      "В ТЗ/извещении есть требования к стране происхождения — для иностранного товара обычно нужны подтверждающие документы."
    );
  } else {
    details.push(
      "Явных требований к стране происхождения в разобранных характеристиках не найдено — но при преимуществе/ограничении площадка может запросить подтверждение происхождения."
    );
  }

  let summary: string;
  if (!stored && !hasForeignOriginSpec) {
    summary =
      "Данные о национальном режиме не загружены. Обновите закупку с ЕИС или откройте извещение на zakupki.gov.ru.";
  } else if (appliedMeasures.length === 0 && catalogMeasures.length === 0) {
    summary = "Запреты и ограничения на иностранные товары в извещении не обнаружены.";
  } else if (appliedMeasures.length === 0 && catalogMeasures.length > 0) {
    const labels = catalogMeasures.map(measureLabel).join(", ");
    summary = `В таблице извещения меры не указаны, но по КТРУ в каталоге ПП № 1875 возможны: ${labels}.`;
  } else if (appliedMeasures.includes("ban")) {
    summary = "В извещении установлен запрет на иностранные товары — участие с импортом, как правило, невозможно.";
  } else if (appliedMeasures.includes("restriction")) {
    summary =
      "В извещении установлено ограничение на иностранные товары — допускается ограниченная доля/квота иностранного происхождения.";
  } else if (appliedMeasures.includes("preference")) {
    summary =
      "В извещении установлено преимущество для товаров российского/ЕАЭС происхождения — иностранные товары допускаются, но с отставанием по цене.";
  } else {
    summary = "По КТРУ в каталоге ПП № 1875 предусмотрены меры нацрежима — в извещении детали уточните на ЕИС.";
  }

  const legalNote = buildLegalNote({
    nmck,
    nmckUnder1M,
    maxUnitPrice,
    unitPriceUnder300k,
    exemptionPossible,
    exemptionDeclared,
    appliedMeasures,
    catalogMeasures,
  });

  return {
    appliedMeasures,
    catalogMeasures,
    hasForeignOriginSpec,
    nmck,
    nmckUnder1M,
    maxUnitPrice,
    unitPriceUnder300k,
    exemptionPossible,
    exemptionDeclared,
    foreignParticipation,
    summary,
    details,
    legalNote,
  };
}

function buildLegalNote(input: {
  nmck: number;
  nmckUnder1M: boolean;
  maxUnitPrice: number | null;
  unitPriceUnder300k: boolean | null;
  exemptionPossible: boolean;
  exemptionDeclared: boolean;
  appliedMeasures: NationalRegimeMeasure[];
  catalogMeasures: NationalRegimeMeasure[];
}): string {
  const parts: string[] = [
    "ПП РФ № 1875 (с 01.01.2025): заказчик вправе установить запрет, ограничение или преимущество для товаров иностранного происхождения.",
  ];

  if (input.nmck > 1_000_000) {
    parts.push(
      `НМЦК ${formatRub(input.nmck)} — выше 1 млн ₽, основание п. 5(и) ПП № 1875 (не применять запрет при малых закупках) обычно не подходит.`
    );
  } else if (input.nmckUnder1M) {
    parts.push(`НМЦК ${formatRub(input.nmck)} — не превышает 1 млн ₽.`);
  }

  if (input.maxUnitPrice !== null) {
    parts.push(
      `Оценочная цена единицы: ${formatRub(input.maxUnitPrice)}${
        input.unitPriceUnder300k ? " (≤ 300 тыс. ₽)" : " (> 300 тыс. ₽)"
      }.`
    );
  }

  if (input.exemptionPossible) {
    parts.push(
      "Заказчик вправе не применять запрет/ограничение (п. 5(и) ПП № 1875), если НМЦК ≤ 1 млн ₽ и цена каждой единицы ≤ 300 тыс. ₽. Это право заказчика, не обязанность — смотрите фактически установленные меры в извещении."
    );
  } else if (
    (input.appliedMeasures.includes("ban") || input.catalogMeasures.includes("ban")) &&
    !input.nmckUnder1M
  ) {
    parts.push("При НМЦК выше 1 млн ₽ льгота для малых закупок не применяется.");
  }

  if (input.exemptionDeclared) {
    parts.push("В извещении указано обоснование невозможности соблюдения запрета/ограничения.");
  }

  parts.push(
    "Исключения безусловны для отдельных позиций приложения № 1 (в т.ч. ПО, поз. 146) — для медизделий обычно не актуально."
  );

  return parts.join(" ");
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

export function readStoredNationalRegime(requirements: Record<string, unknown>): StoredNationalRegime | null {
  const raw = requirements.nationalRegime;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as StoredNationalRegime;
  if (!Array.isArray(r.positions) && !Array.isArray(r.ktruHints)) return null;
  return r;
}

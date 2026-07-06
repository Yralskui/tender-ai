import { matchProductToCatalog } from "@/lib/matching";
import type { StructuredCatalogItem } from "@/lib/productDimensions";
import { resolveProcurementProductNames } from "@/lib/tzNomenclature";
import {
  isGarbageCharacteristic,
  looksLikeProductName,
  detectProcurementKind,
  isUsefulTzCharacteristic,
  shouldBlockRuCatalogMatch,
  type ProcurementKind,
} from "@/lib/tzSanitizer";
import { normalizeDisplayText, TZ_POSITION_LINE_RE, TZ_POSITION_NUM_RE } from "@/lib/textNormalize";
import { buildProcurementBundles, bundleStats } from "@/lib/tzProcurementBundles";

export type { ProcurementKind };

/** Числа для сообщений «N характеристик» — как в блоке наборов на карточке */
export function summarizeTzDisplayCounts(
  requirements: RequirementsLike,
  tenderTitle?: string
): { productCount: number; charCount: number } {
  const stats = bundleStats(
    buildProcurementBundles(requirements, tenderTitle, [], [])
  );
  return { productCount: stats.productCount, charCount: stats.charCount };
}

export interface ProcurementItem {
  id: string;
  name: string;
  ktruCode?: string;
}

export interface NomenclatureMatchRow {
  requested: string;
  matchedProduct: string | null;
  status: "match" | "partial" | "missing";
  note: string;
}

export interface ParticipationForecast {
  /** Вероятность успешной подачи / выигрыша (оценка по документам и номенклатуре) */
  chancePercent: number;
  /** Покрытие позиций ТЗ каталогом РУ, % */
  coveragePercent?: number;
  level: "high" | "medium" | "low" | "none";
  headline: string;
  detail: string;
  matchedItems: number;
  partialItems: number;
  missingItems: number;
  totalItems: number;
  /** До разбора файла ТЗ с zakupki — оценка занижена/неточна */
  preliminary?: boolean;
}

interface RequirementsLike {
  tzProducts?: string[];
  productSpecs?: string[];
  ktruCodes?: string[];
  technicalAssignment?: string;
  tzVolumes?: Array<{ name: string; ktruCode?: string; quantity: number; unit: string; position?: string }>;
}

function isMetaSpec(line: string): boolean {
  const l = line.toLowerCase();
  return (
    /^ктру:/i.test(line) ||
    /регистрационное удостоверен/i.test(l) ||
    l.length < 6
  );
}

/** Что нужно поставить заказчику — из ТЗ файла или извлечённых позиций */
export function extractProcurementItems(requirements: RequirementsLike, tenderTitle?: string): ProcurementItem[] {
  const kind = detectProcurementKind(tenderTitle, requirements.technicalAssignment, ...(requirements.tzProducts || []));
  if (kind === "service" || kind === "works") {
    return [];
  }

  const names = resolveProcurementProductNames(requirements, tenderTitle);
  const volumes = requirements.tzVolumes || [];
  return names.map((name, i) => ({
    id: volumes[i]?.position ? `item-${volumes[i].position}` : `item-${i + 1}`,
    name: normalizeDisplayText(name),
    ktruCode: volumes[i]?.ktruCode,
  }));
}

export function resolveProcurementKind(
  requirements: RequirementsLike,
  tenderTitle?: string
): ProcurementKind {
  return detectProcurementKind(
    tenderTitle,
    requirements.technicalAssignment,
    ...(requirements.productSpecs || []).slice(0, 3),
    ...(requirements.tzProducts || [])
  );
}

/** Характеристики из ТЗ (не номенклатура) — отдельный список */
export function extractCharacteristicSpecs(requirements: RequirementsLike): string[] {
  const noise =
    /участник\s+закупки|значение характеристики|мм\s+участник|—\s*мм\s+участник/i;

  return (requirements.productSpecs || [])
    .filter((s) => !TZ_POSITION_LINE_RE.test(s) && !TZ_POSITION_NUM_RE.test(s) && !isMetaSpec(s))
    .filter((s) => !isGarbageCharacteristic(s))
    .filter((s) => isUsefulTzCharacteristic(s))
    .filter((s) => !noise.test(s))
    .filter((s) => s.includes(" — ") || /^[^:]+:\s*[^:]{1,120}$/.test(s))
    .filter((s) => s.length > 10 && s.length < 200)
    .map((s) => normalizeDisplayText(s))
    .slice(0, Math.max(24, (requirements.tzVolumes?.length || 0) * 5));
}

export function blockNomenclatureMatches(
  rows: NomenclatureMatchRow[],
  reason: string
): NomenclatureMatchRow[] {
  if (rows.length === 0) return rows;
  return rows.map((row) => ({
    ...row,
    status: "missing" as const,
    matchedProduct: null,
    note: reason,
  }));
}

export function resolveRuMatchBlock(input: {
  tenderTitle?: string;
  tzProducts?: string[];
  nomenclatureMismatch?: boolean;
}): { blocked: boolean; reason: string } {
  return shouldBlockRuCatalogMatch(input);
}

export function buildNomenclatureMatchTable(
  items: ProcurementItem[],
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): NomenclatureMatchRow[] {
  return items.map((item) => {
    const m = matchProductToCatalog(item.name, catalogProducts, catalogStructured);
    return {
      requested: item.name,
      matchedProduct: m.matchedProduct,
      status: m.status,
      note: m.note,
    };
  });
}

export function buildCharacteristicMatches(
  specs: string[],
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): NomenclatureMatchRow[] {
  return specs.slice(0, 60).map((spec) => {
    const m = matchProductToCatalog(spec, catalogProducts, catalogStructured);
    return {
      requested: spec,
      matchedProduct: m.matchedProduct,
      status: m.status,
      note: m.note,
    };
  });
}

export function computeParticipationForecast(
  analysisScore: number,
  nomenclatureRows: NomenclatureMatchRow[],
  hasBlockers: boolean,
  hasCatalog: boolean,
  options: {
    procurementKind?: ProcurementKind;
    tzEnrichmentPending?: boolean;
    tzParsedFromFile?: boolean;
    nomenclatureMismatch?: boolean;
  } = {}
): ParticipationForecast {
  const {
    procurementKind = "unknown",
    tzEnrichmentPending = false,
    tzParsedFromFile = false,
    nomenclatureMismatch = false,
  } = options;

  if (procurementKind === "service" || procurementKind === "works") {
    return {
      chancePercent: 3,
      level: "none",
      headline: procurementKind === "service" ? "Это закупка услуг" : "Это закупка работ",
      detail:
        "Поставка изделий по РУ здесь не применима. Такая закупка не для поставщика медизделий и текстиля.",
      matchedItems: 0,
      partialItems: 0,
      missingItems: 0,
      totalItems: 0,
      coveragePercent: 0,
    };
  }

  const totalItems = nomenclatureRows.length;
  const matchedItems = nomenclatureRows.filter((r) => r.status === "match").length;
  const partialItems = nomenclatureRows.filter((r) => r.status === "partial").length;
  const missingItems = nomenclatureRows.filter((r) => r.status === "missing").length;

  if (!hasCatalog) {
    return {
      chancePercent: Math.min(25, analysisScore),
      level: "none",
      headline: "Загрузите РУ с приложением",
      detail: "Без каталога изделий из РУ нельзя оценить, покроете ли вы номенклатуру закупки.",
      matchedItems,
      partialItems,
      missingItems,
      totalItems,
      coveragePercent: 0,
    };
  }

  const hardBlock =
    nomenclatureMismatch || (hasBlockers && matchedItems === 0 && partialItems === 0);
  if (hardBlock || (totalItems > 0 && matchedItems === 0 && partialItems === 0)) {
    const chance = Math.max(5, Math.min(18, Math.round(analysisScore * 0.2)));
    const blockedMatched = hardBlock ? 0 : matchedItems;
    const blockedPartial = hardBlock ? 0 : partialItems;
    const blockedMissing = hardBlock && totalItems > 0 ? totalItems : missingItems;
    return {
      chancePercent: chance,
      level: "none",
      headline: "Участие не рекомендуем",
      detail: nomenclatureMismatch
        ? "Номенклатура закупки относится к другому виду изделий — ваш РУ не покрывает эти позиции."
        : "Номенклатура закупки не совпадает с позициями в вашем РУ — нужны другие изделия или другое удостоверение.",
      matchedItems: blockedMatched,
      partialItems: blockedPartial,
      missingItems: blockedMissing,
      totalItems,
      coveragePercent: 0,
    };
  }

  if (totalItems === 0) {
    return {
      chancePercent: tzEnrichmentPending ? 8 : Math.min(15, Math.round(analysisScore * 0.2)),
      level: "none",
      headline: tzEnrichmentPending ? "Нужен разбор ТЗ" : "Нет позиций из ТЗ",
      detail: tzEnrichmentPending
        ? "Закупка загружена из поиска ЕИС без файлов. Нажмите «80 с разбором ТЗ» или откройте «Описание объекта закупки» на zakupki.gov.ru."
        : "Не удалось извлечь номенклатуру из документов закупки. Скачайте «Описание объекта закупки» или пересинхронизируйте с разбором ТЗ.",
      matchedItems: 0,
      partialItems: 0,
      missingItems: 0,
      totalItems: 0,
      coveragePercent: 0,
    };
  }

  const nomenclatureRatio = totalItems > 0 ? (matchedItems + partialItems * 0.35) / totalItems : 0;
  const coveragePercent =
    totalItems > 0 ? Math.round(((matchedItems + partialItems * 0.4) / totalItems) * 100) : 0;

  let chance = Math.round(nomenclatureRatio * 50 + (analysisScore / 100) * 30);
  if (missingItems > 0) chance = Math.min(chance, coveragePercent + 12);
  chance = Math.max(8, Math.min(92, Math.min(chance, coveragePercent + 20)));

  let level: ParticipationForecast["level"] = "low";
  let headline = "Слабое совпадение — проверьте вручную";
  let detail = `Покрытие номенклатуры ТЗ: ${matchedItems} из ${totalItems}${partialItems ? ` (+${partialItems} уточнить)` : ""}${missingItems ? `, ${missingItems} нет в РУ` : ""}.`;

  if (
    coveragePercent >= 85 &&
    matchedItems >= Math.max(1, totalItems * 0.85) &&
    partialItems === 0 &&
    missingItems === 0
  ) {
    level = "high";
    headline = "Хорошее покрытие номенклатуры ТЗ";
    detail = `Все ${matchedItems} позиций из ТЗ найдены в вашем РУ. Проверьте размеры и характеристики перед подачей заявки.`;
  } else if (coveragePercent >= 50 || matchedItems > 0 || partialItems > 0) {
    level = "medium";
    headline = "Частичное покрытие ТЗ";
    detail = `Совпало ${matchedItems} из ${totalItems} позиций ТЗ${partialItems ? `, ещё ${partialItems} требуют проверки` : ""}${missingItems ? `, ${missingItems} отсутствуют в РУ` : ""}.`;
  }

  const preliminary = !tzParsedFromFile && totalItems > 0 && !(matchedItems === totalItems && partialItems === 0);
  let adjCoverage = coveragePercent;
  let adjChance = chance;
  if (preliminary) {
    adjCoverage = Math.min(coveragePercent, 40);
    adjChance = Math.min(chance, 35);
    if (level === "high") level = "medium";
    headline = "Предварительно — нужен разбор файла ТЗ";
    detail = `По данным извещения ЕИС: ${detail} Точный процент — после разбора файла «Техническое задание».`;
  }

  return {
    chancePercent: adjChance,
    level,
    headline,
    detail,
    matchedItems,
    partialItems,
    missingItems,
    totalItems,
    coveragePercent: adjCoverage,
    preliminary,
  };
}

export function summarizeTechnicalAssignment(requirements: RequirementsLike): string {
  const items = extractProcurementItems(requirements);
  const goods =
    items.length > 0
      ? items.length > 3
        ? `Поставка: ${items.length} объектов (${items[0].name.slice(0, 50)}… и др.).`
        : `Поставка: ${items.slice(0, 5).map((i) => i.name).join("; ")}${items.length > 5 ? "…" : ""}.`
      : "";

  const volumes = (requirements.tzVolumes || []).filter((v) => v.quantity > 0);
  const totalQty = volumes.reduce((s, v) => s + v.quantity, 0);
  let volumeLine = "";
  if (totalQty > 0) {
    if (volumes.length > 1) {
      volumeLine = `Объём закупки: всего ${totalQty} ${volumes[0]?.unit || "шт"} (${volumes.length} позиций).`;
    } else {
      volumeLine = `Объём закупки: ${volumes[0].quantity} ${volumes[0].unit || "шт"} — ${volumes[0].name}.`;
    }
  } else {
    const fromSpec = (requirements.productSpecs || []).find((s) => /^Объём закупки:/i.test(s));
    if (fromSpec) volumeLine = fromSpec.endsWith(".") ? fromSpec : `${fromSpec}.`;
  }

  const srcText = (requirements.technicalAssignment || "")
    .replace(/\s+/g, " ")
    .trim();
  const place =
    srcText.match(/место\s+поставки[^:]*:\s*([^.;\n]{12,220})/i)?.[1]?.trim() ||
    (requirements.productSpecs || [])
      .find((s) => /место\s+поставки/i.test(s))
      ?.replace(/^.*место\s+поставки[^:]*:\s*/i, "")
      .trim();

  const placeLine = place ? `Место поставки: ${place.replace(/\s+/g, " ").slice(0, 180)}.` : "";

  if (goods || volumeLine || placeLine) {
    return [goods, volumeLine, placeLine].filter(Boolean).join(" ");
  }
  return srcText;
}

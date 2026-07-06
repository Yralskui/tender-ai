/**
 * Позиции ТЗ как «наборы»: изделие + признаки (характеристики).
 * Одинаковый вид и с разобранным DOCX, и когда есть только заголовок «комплект».
 */

import { matchProductToCatalog, matchTzCharacteristic } from "@/lib/matching";
import type { StructuredCatalogItem } from "@/lib/productDimensions";
import { isCharacteristicFieldName, looksLikeProductName, isUsefulTzCharacteristic, titleConflictsWithTzProducts, isPlaceholderPositionName } from "@/lib/tzSanitizer";
import { isKtruCode, normalizeDisplayText, normalizeTzSpecText, parseTzPositionName, parseTzPositionNumber, TZ_POSITION_NUM_RE } from "@/lib/textNormalize";
import { resolveProcurementProductNames } from "@/lib/tzNomenclature";
import { resolveTzVolumes, type TzVolume } from "@/lib/tzVolumes";
import { buildKtruNameMapFromSpecs, resolveTzProductLabel } from "@/lib/tzProductLabelResolve";
import type { NomenclatureMatchRow } from "@/lib/tenderPresentation";

export interface TzCharacteristic {
  id: string;
  label: string;
  field?: string;
  value?: string;
  match: NomenclatureMatchRow;
}

export interface ProcurementBundle {
  id: string;
  position: number;
  name: string;
  ktruCode?: string;
  quantityText?: string;
  isKit: boolean;
  /** true — состав подсказан из РУ, ТЗ не разобрано */
  kitFromRuHint?: boolean;
  characteristics: TzCharacteristic[];
  match: NomenclatureMatchRow;
}

interface RequirementsInput {
  tzProducts?: string[];
  productSpecs?: string[];
  technicalAssignment?: string;
  ktruCodes?: string[];
  tzVolumes?: TzVolume[];
}

function pushCharacteristic(
  bundle: ProcurementBundle,
  spec: string,
  charLabel: string,
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
) {
  const parts = parseCharParts(charLabel);
  if (!isUsefulTzCharacteristic(spec, parts.field || charLabel, parts.value)) return;

  if (!parts.field && /^(да|нет)$/i.test((parts.value || "").trim())) return;

  const dedupeKey = `${(parts.field || charLabel).toLowerCase()}|${(parts.value || "").toLowerCase()}`;
  if (bundle.characteristics.some((c) => `${(c.field || c.label).toLowerCase()}|${(c.value || "").toLowerCase()}` === dedupeKey)) {
    return;
  }

  const fieldNorm = normalizeTzSpecText(parts.field || charLabel).toLowerCase();
  const bundleNorm = bundle.name.toLowerCase().replace(/\s+/g, " ").trim();
  const valNorm = (parts.value || "").toLowerCase().trim();
  if (
    /^(соответствие|наличие)$/i.test(valNorm) &&
    (fieldNorm === bundleNorm ||
      (fieldNorm.length > 25 && bundleNorm.includes(fieldNorm)) ||
      (bundleNorm.length > 25 && fieldNorm.includes(bundleNorm)))
  ) {
    return;
  }

  const m = matchTzCharacteristic(
    parts.field || charLabel,
    parts.value || charLabel,
    bundle.name,
    catalogProducts,
    catalogStructured
  );
  bundle.characteristics.push({
    id: `${bundle.id}-c${bundle.characteristics.length}`,
    label: normalizeDisplayText(parts.field && parts.value ? `${parts.field}: ${parts.value}` : charLabel),
    field: parts.field,
    value: parts.value,
    match: {
      requested: spec,
      matchedProduct: m.matchedProduct,
      status: m.status,
      note: m.note,
    },
  });
}

function isKitName(name: string): boolean {
  const trimmed = name.trim();
  if (/^(комплект|набор|к-т)\b/i.test(trimmed)) return true;
  return /^комплект\s+(бель|одежд|защит|сиз|хирург|медицин)/i.test(trimmed);
}

function splitSpecLine(spec: string): { product: string; charLabel: string } | null {
  const dash = spec.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (dash) {
    const product = dash[1].trim();
    const charLabel = dash[2].trim();
    if (product.length >= 4 && charLabel.length >= 3) {
      return { product, charLabel };
    }
  }

  const colon = spec.match(/^([^:]{4,80}):\s*(.+)$/);
  if (colon) {
    const product = colon[1].trim();
    const charLabel = colon[2].trim();
    if (
      looksLikeProductName(product) &&
      !isCharacteristicFieldName(product) &&
      charLabel.length >= 2 &&
      charLabel.length < 100
    ) {
      return { product, charLabel };
    }
  }

  return null;
}

function parseCharParts(label: string): { field?: string; value?: string } {
  const normalized = normalizeTzSpecText(label);
  const m = normalized.match(/^([^:]+):\s*(.+)$/);
  if (m) return { field: m[1].trim(), value: m[2].trim() };
  return { value: normalized };
}

function catalogItemsForKit(
  kitName: string,
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): string[] {
  const kitLower = kitName.toLowerCase();
  const isProtective = /защитн|сиз|одежд/i.test(kitLower);
  const isLinen = /бель|постель|простын/i.test(kitLower);
  const isSurgical = /хирург|операцион/i.test(kitLower);

  const pool = catalogStructured?.length
    ? catalogStructured.map((i) => i.displayText || i.name)
    : catalogProducts;

  const filtered = pool.filter((p) => {
    const l = p.toLowerCase();
    if (/комплект/i.test(l)) return true;
    if (isProtective && /халат|бахил|шапоч|маск|комбинезон|костюм|нарукавник/i.test(l)) return true;
    if (isLinen && /простын|наволоч|пододе|пеленк|бель/i.test(l)) return true;
    if (isSurgical && /халат|брюк|сорочк|простын|салфет|бель|хирург/i.test(l)) return true;
    return false;
  });

  return [...new Set(filtered)].slice(0, 12);
}

function expandKitCharacteristics(
  kitName: string,
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): TzCharacteristic[] {
  const items = catalogItemsForKit(kitName, catalogProducts, catalogStructured);
  return items.map((label, i) => {
    const m = matchProductToCatalog(label, catalogProducts, catalogStructured);
    return {
      id: `kit-char-${i}`,
      label,
      match: {
        requested: label,
        matchedProduct: m.matchedProduct,
        status: m.status,
        note: m.note,
      },
    };
  });
}

/** Собирает наборы из productSpecs + tzProducts */
export function buildProcurementBundles(
  requirements: RequirementsInput,
  tenderTitle: string | undefined,
  catalogProducts: string[],
  catalogStructured?: StructuredCatalogItem[]
): ProcurementBundle[] {
  const resolvedVolumes = resolveTzVolumes(requirements);
  const reqs: RequirementsInput =
    resolvedVolumes.length > 0 ? { ...requirements, tzVolumes: resolvedVolumes } : requirements;
  const specs = reqs.productSpecs || [];
  const bundleMap = new Map<string, ProcurementBundle>();
  let currentName = "";
  let currentLinePosition = "";
  let position = 0;
  const orphanSpecs: Array<{ field: string; value: string; raw: string }> = [];
  const attachedOrphans = new Set<string>();
  const ktruNameMap = buildKtruNameMapFromSpecs(specs);

  const labelFor = (name: string, ktruCode?: string, linePos?: string) =>
    resolveTzProductLabel({
      name,
      ktruCode,
      position: linePos,
      tenderTitle,
      ktruNameMap,
    });

  const bundleKey = (name: string, linePos?: string) =>
    `${linePos || ""}|${name}`.toLowerCase();

  const findBundleByPosition = (linePos: string): ProcurementBundle | undefined => {
    if (!linePos) return undefined;
    for (const [key, bundle] of bundleMap) {
      const sep = key.indexOf("|");
      if (sep > 0 && key.slice(0, sep) === linePos) return bundle;
    }
    return undefined;
  };

  const ensureBundle = (name: string, ktruCode?: string, linePos?: string): ProcurementBundle => {
    let displayName = isKtruCode(name) ? "" : name;
    if (!displayName && linePos) {
      for (const spec of specs) {
        const posName = parseTzPositionName(spec);
        if (!posName || isKtruCode(posName)) continue;
        const specPos = specs.find((s) => TZ_POSITION_NUM_RE.test(s) && parseTzPositionNumber(s) === linePos);
        if (specPos || !linePos) {
          displayName = posName;
          break;
        }
      }
    }
    if (!displayName) displayName = name;

    const key = bundleKey(displayName, linePos);
    let b = bundleMap.get(key);
    if (!b && linePos) {
      b = findBundleByPosition(linePos);
    }
    if (!b) {
      if ((reqs.tzVolumes?.length ?? 0) > 1 && !linePos) {
        const byName = [...bundleMap.values()].find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        if (byName) return byName;
      }
      const displayPos = linePos ? parseInt(linePos, 10) : ++position;
      if (!linePos) position = displayPos;
      const vol = linePos
        ? (reqs.tzVolumes || []).find((v) => String(v.position) === String(linePos))
        : (reqs.tzVolumes || []).find((v) => {
            const vn = (v.name || "").toLowerCase();
            const kn = displayName.toLowerCase();
            return (
              vn === kn ||
              kn.includes(vn) ||
              vn.includes(kn.replace(/\s*\(размер[^)]+\)\s*$/i, "").trim()) ||
              (ktruCode && v.ktruCode === ktruCode)
            );
          });
      let bundleName = vol?.name && !isKtruCode(vol.name) ? vol.name : displayName;
      if (isKtruCode(bundleName)) bundleName = displayName;
      bundleName = labelFor(bundleName, vol?.ktruCode || ktruCode, linePos || vol?.position);
      const m = matchProductToCatalog(bundleName, catalogProducts, catalogStructured);
      b = {
        id: `bundle-${displayPos}`,
        position: displayPos,
        name: normalizeDisplayText(bundleName),
        ktruCode: vol?.ktruCode || ktruCode,
        quantityText:
          vol && vol.quantity > 0
            ? `${vol.quantity.toLocaleString("ru-RU")} ${vol.unit || "шт"}`
            : undefined,
        isKit: isKitName(bundleName),
        characteristics: [],
        match: {
          requested: bundleName,
          matchedProduct: m.matchedProduct,
          status: m.status,
          note: m.note,
        },
      };
      bundleMap.set(bundleKey(bundleName, linePos || String(displayPos)), b);
      if (linePos) bundleMap.set(bundleKey(bundleName, linePos), b);
    } else if (ktruCode && !b.ktruCode) {
      b.ktruCode = ktruCode;
    }
    return b;
  };

  if ((reqs.tzVolumes?.length ?? 0) >= 1) {
    for (const vol of reqs.tzVolumes!) {
      if (vol.quantity > 0) ensureBundle(vol.name || "позиция", vol.ktruCode, vol.position);
    }
  }

  for (const raw of specs) {
    const spec = normalizeTzSpecText(raw);
    if (!spec || spec.length < 4) continue;
    if (/^Объём закупки:/i.test(spec)) continue;

    if (TZ_POSITION_NUM_RE.test(spec)) {
      currentLinePosition = parseTzPositionNumber(spec) || "";
      continue;
    }

    const positionName = parseTzPositionName(spec);
    if (positionName) {
      currentName = labelFor(positionName, undefined, currentLinePosition || undefined);
      if (looksLikeProductName(currentName) || currentName.length >= 12) {
        ensureBundle(currentName, undefined, currentLinePosition || undefined);
      }
      continue;
    }

    if (/^КТРУ:/i.test(spec)) {
      const code = spec.replace(/^КТРУ:\s*/i, "").trim();
      if (currentName) {
        ensureBundle(currentName, code, currentLinePosition || undefined).ktruCode = code;
      }
      continue;
    }

    const split = splitSpecLine(spec);
    if (
      split &&
      (looksLikeProductName(split.product) ||
        split.product.length >= 12 ||
        isPlaceholderPositionName(split.product)) &&
      !isCharacteristicFieldName(split.product)
    ) {
      const productLabel = labelFor(split.product, undefined, currentLinePosition || undefined);
      const b =
        (currentLinePosition ? findBundleByPosition(currentLinePosition) : undefined) ||
        ensureBundle(productLabel, undefined, currentLinePosition || undefined);
      pushCharacteristic(b, spec, split.charLabel, catalogProducts, catalogStructured);
      currentName = productLabel;
      continue;
    }

    const colonChar = spec.match(/^([^:]{3,100}):\s*(.+)$/);
    if (colonChar) {
      const field = colonChar[1].trim();
      const value = colonChar[2].trim();
      const isCharField =
        isCharacteristicFieldName(field) ||
        (!looksLikeProductName(field) &&
          !isPlaceholderPositionName(field) &&
          field.length >= 3 &&
          field.length <= 120);
      if (isCharField && !spec.includes(" — ")) {
        if (isUsefulTzCharacteristic(spec, field, value)) {
          const key = `${field.toLowerCase()}|${value.toLowerCase()}`;
          if (!attachedOrphans.has(key)) {
            attachedOrphans.add(key);
            orphanSpecs.push({ field, value, raw: spec });
          }
        }
        continue;
      }
    }

    if (currentName && spec.includes(" — ")) {
      const b =
        (currentLinePosition ? findBundleByPosition(currentLinePosition) : undefined) ||
        bundleMap.get(bundleKey(currentName, currentLinePosition)) ||
        bundleMap.get(currentName.toLowerCase());
      if (b) {
        const charPart = spec.replace(/^[^:]+:\s*/, "");
        pushCharacteristic(b, spec, charPart, catalogProducts, catalogStructured);
      }
    }
  }

  if (bundleMap.size === 0) {
    const names = resolveProcurementProductNames(reqs, tenderTitle);
    for (const name of names) {
      ensureBundle(name);
    }
  }

  const byPosition = new Map<number, ProcurementBundle>();
  for (const b of bundleMap.values()) {
    const prev = byPosition.get(b.position);
    if (!prev) {
      byPosition.set(b.position, b);
      continue;
    }
    const vol = reqs.tzVolumes?.find((v) => v.position === String(b.position));
    const bVolMatch = Boolean(vol?.name && b.name === normalizeDisplayText(vol.name));
    const prevVolMatch = Boolean(vol?.name && prev.name === normalizeDisplayText(vol.name));
    if (bVolMatch && !prevVolMatch) {
      byPosition.set(b.position, b);
    } else if (!bVolMatch && prevVolMatch) {
      continue;
    } else if (b.characteristics.length > prev.characteristics.length) {
      byPosition.set(b.position, b);
    }
  }
  const bundles = [...byPosition.values()].sort((a, b) => a.position - b.position);

  if (orphanSpecs.length > 0 && bundles.length > 0) {
    const primary = bundles[0];
    const existing = new Set(
      primary.characteristics.map(
        (c) => `${(c.field || c.label).toLowerCase()}|${(c.value || "").toLowerCase()}`
      )
    );
    for (const o of orphanSpecs) {
      if (!o.field?.trim()) continue;
      if (!o.field.trim() && /^(да|нет)$/i.test(o.value)) continue;
      const key = `${o.field.toLowerCase()}|${o.value.toLowerCase()}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const m = matchTzCharacteristic(
        o.field,
        o.value,
        primary.name,
        catalogProducts,
        catalogStructured
      );
      primary.characteristics.push({
        id: `${primary.id}-c${primary.characteristics.length}`,
        label: normalizeDisplayText(`${o.field}: ${o.value}`),
        field: o.field,
        value: o.value,
        match: {
          requested: o.raw,
          matchedProduct: m.matchedProduct,
          status: m.status,
          note: m.note,
        },
      });
    }
  }

  for (const bundle of bundles) {
    if (bundle.isKit && bundle.characteristics.length === 0 && catalogProducts.length > 0) {
      const kitChars = expandKitCharacteristics(bundle.name, catalogProducts, catalogStructured);
      if (kitChars.length > 0) {
        bundle.characteristics = kitChars;
        bundle.kitFromRuHint = true;
      }
    }
  }

  if (tenderTitle && titleConflictsWithTzProducts(tenderTitle, reqs.tzProducts || [])) {
    const corrected = resolveProcurementProductNames(reqs, tenderTitle);
    if (corrected.length > 0) {
      const preservedChars = bundles[0]?.characteristics ?? [];
      return corrected.map((name, i) => {
        const m = matchProductToCatalog(name, catalogProducts, catalogStructured);
        return {
          id: `bundle-${i + 1}`,
          position: i + 1,
          name: normalizeDisplayText(name),
          ktruCode: reqs.tzVolumes?.[i]?.ktruCode,
          quantityText:
            reqs.tzVolumes?.[i] && reqs.tzVolumes[i].quantity > 0
              ? `${reqs.tzVolumes[i].quantity.toLocaleString("ru-RU")} ${reqs.tzVolumes[i].unit || "шт"}`
              : undefined,
          isKit: isKitName(name),
          characteristics: i === 0 ? preservedChars : [],
          match: {
            requested: name,
            matchedProduct: m.matchedProduct,
            status: m.status,
            note: m.note,
          },
        };
      });
    }
  }

  return bundles;
}

export function blockProcurementBundleMatches(
  bundles: ProcurementBundle[],
  reason: string
): ProcurementBundle[] {
  return bundles.map((b) => ({
    ...b,
    match: {
      ...b.match,
      status: "missing" as const,
      matchedProduct: null,
      note: reason,
    },
    characteristics: b.characteristics.map((c) => ({
      ...c,
      match: {
        ...c.match,
        status: "missing" as const,
        matchedProduct: null,
        note: reason,
      },
    })),
  }));
}

export function bundlesToForecastRows(bundles: ProcurementBundle[]): NomenclatureMatchRow[] {
  return bundles.map((b) => b.match);
}

export function bundleStats(bundles: ProcurementBundle[]): {
  productCount: number;
  charCount: number;
  matchedProducts: number;
  matchedChars: number;
  partialCount: number;
  missingCount: number;
} {
  let matchedProducts = 0;
  let matchedChars = 0;
  let partialCount = 0;
  let missingCount = 0;
  let charCount = 0;

  for (const b of bundles) {
    if (b.match.status === "match") matchedProducts++;
    else if (b.match.status === "partial") partialCount++;
    else missingCount++;

    for (const c of b.characteristics) {
      charCount++;
      if (c.match.status === "match") matchedChars++;
      else if (c.match.status === "partial") partialCount++;
      else missingCount++;
    }
  }

  return {
    productCount: bundles.length,
    charCount,
    matchedProducts,
    matchedChars,
    partialCount,
    missingCount,
  };
}

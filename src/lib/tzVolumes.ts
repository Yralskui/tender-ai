/**
 * Объёмы закупки (количество шт/компл) — из tzVolumes, строк «Объём закупки:» и карточки ЕИС.
 */

export interface TzVolume {
  name?: string;
  quantity: number;
  unit?: string;
  position?: string;
  ktruCode?: string;
}

const PACK_SIZE_FIELD_RE =
  /^(количество\s+в\s+упаковке|кратность|фасовк|наборность|число\s+единиц\s+в\s+упаковке)/i;

/** «Количество в упаковке: 100» — фасовка, не объём закупки */
export function isPackSizeCharacteristic(field: string): boolean {
  return PACK_SIZE_FIELD_RE.test(field.trim());
}

export function parseProcurementVolumeSpec(
  spec: string
): { quantity: number; unit: string; name?: string } | null {
  const m = spec.match(
    /^Объём\s+закупки:\s*([\d\s\u00a0]+)\s*(шт\.?|штук[аи]?|компл\.?|упак\.?|к-т)\b(?:\s*[—–-]\s*(.+))?/i
  );
  if (!m) return null;
  const qty = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  if (qty <= 0) return null;
  const unit = /компл|к-т/i.test(m[2]) ? "компл" : "шт";
  return { quantity: qty, unit, name: m[3]?.trim() };
}

function parsePositionNumber(spec: string): string | null {
  return spec.match(/^Позиция\s+ТЗ\s*№:\s*(\d+)/i)?.[1] ?? null;
}

function parsePositionName(spec: string): string | null {
  return spec.match(/^Позиция\s+ТЗ:\s*(.+)/i)?.[1]?.trim() ?? null;
}

/** Восстановить tzVolumes из productSpecs / technicalAssignment, если в БД пусто */
export function deriveTzVolumesFromRequirements(reqs: {
  tzVolumes?: TzVolume[];
  productSpecs?: string[];
  tzProducts?: string[];
  technicalAssignment?: string;
}): TzVolume[] {
  const existing = (reqs.tzVolumes || []).filter((v) => v.quantity > 0);
  if (existing.length > 0) return existing;

  const specs = reqs.productSpecs || [];
  const fromSpecs: TzVolume[] = [];
  let currentPos: string | undefined;
  let currentName: string | undefined;
  let currentKtru: string | undefined;

  for (const raw of specs) {
    const spec = raw.trim();
    const vol = parseProcurementVolumeSpec(spec);
    if (vol) {
      fromSpecs.push({
        name: vol.name || currentName || reqs.tzProducts?.[fromSpecs.length],
        quantity: vol.quantity,
        unit: vol.unit,
        position: currentPos,
        ktruCode: currentKtru,
      });
      continue;
    }
    const pos = parsePositionNumber(spec);
    if (pos) {
      currentPos = pos;
      continue;
    }
    const pname = parsePositionName(spec);
    if (pname) {
      currentName = pname;
      continue;
    }
    if (/^КТРУ:/i.test(spec)) {
      currentKtru = spec.replace(/^КТРУ:\s*/i, "").trim();
    }
  }

  if (fromSpecs.length > 0) return fromSpecs;

  const ta = reqs.technicalAssignment || "";
  const taVol = ta.match(/Объём\s+закупки:\s*([\d\s]+)\s*(шт|штук|компл)/i);
  if (taVol) {
    const qty = parseInt(taVol[1].replace(/[^\d]/g, ""), 10);
    if (qty > 0) {
      return [
        {
          name: reqs.tzProducts?.[0],
          quantity: qty,
          unit: /компл/i.test(taVol[2]) ? "компл" : "шт",
        },
      ];
    }
  }

  return [];
}

export function resolveTzVolumes(reqs: Parameters<typeof deriveTzVolumesFromRequirements>[0]): TzVolume[] {
  return deriveTzVolumesFromRequirements(reqs);
}

export function formatVolumeQuantity(qty: number, unit?: string): string {
  const u = unit || "шт";
  return `${qty.toLocaleString("ru-RU")} ${u}`;
}

export function summarizeProcurementVolume(volumes: TzVolume[]): string | null {
  const valid = volumes.filter((v) => v.quantity > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((s, v) => s + v.quantity, 0);
  const unit = valid[0]?.unit || "шт";
  if (valid.length === 1) {
    const v = valid[0];
    const qty = formatVolumeQuantity(v.quantity, v.unit || unit);
    return v.name ? `Объём закупки: ${qty} — ${v.name}` : `Объём закупки: ${qty}`;
  }
  return `Объём закупки: всего ${formatVolumeQuantity(total, unit)} (${valid.length} позиций)`;
}

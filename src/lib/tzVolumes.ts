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

/** «5. Салфетки хирургические: 20» из productSpecs */
function parseNumberedLineVolume(spec: string): TzVolume | null {
  const embedded = spec.match(/ — (\d{1,2})\.\s+(.+?):\s*(\d{1,7})\s*$/);
  if (embedded) {
    const name = embedded[2].trim();
    const qty = parseInt(embedded[3], 10);
    if (name.length >= 4 && qty > 0 && !/значение характеристики/i.test(name)) {
      return { position: embedded[1], name, quantity: qty, unit: "шт" };
    }
  }

  const colon = spec.match(/^(\d{1,2})\.\s+(.+?):\s*(\d{1,7})\s*$/);
  if (colon) {
    const name = colon[2].trim();
    const qty = parseInt(colon[3], 10);
    if (name.length >= 4 && qty > 0 && !/значение характеристики/i.test(name)) {
      return { position: colon[1], name, quantity: qty, unit: "шт" };
    }
  }
  const inline = spec.match(/^(\d{1,2})\.\s+(.+?)\s+(\d{1,7})\s+(?:шт\.?|штук[аи]?)\b/i);
  if (inline) {
    const name = inline[2].trim();
    const qty = parseInt(inline[3], 10);
    if (name.length >= 8 && qty > 0 && !/значение характеристики/i.test(name)) {
      return { position: inline[1], name, quantity: qty, unit: "шт" };
    }
  }
  return null;
}

/** «1. Простыня … 1 шт» из текста Excel «Описание объекта закупки» */
export function parseOozLineVolumesFromText(text: string): TzVolume[] {
  const out: TzVolume[] = [];
  const seen = new Set<string>();
  const re = /(\d{1,2})\.\s+([^0-9\n]{10,220}?)\s+(\d{1,7})\s+шт\.?\b/gi;
  for (const m of text.matchAll(re)) {
    const name = m[2].replace(/\s+/g, " ").trim();
    if (/значение характеристики|участник закупки/i.test(name)) continue;
    const qty = parseInt(m[3], 10);
    if (qty <= 0 || name.length < 8) continue;
    const key = `${m[1]}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ position: m[1], name, quantity: qty, unit: "шт" });
  }
  return out;
}

export function pickRicherTzVolumes(
  ...lists: Array<TzVolume[] | undefined | null>
): TzVolume[] | undefined {
  const candidates = lists
    .map((list) => (list || []).filter((v) => v.quantity > 0))
    .filter((list) => list.length > 0);
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
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
      continue;
    }
    const numbered = parseNumberedLineVolume(spec);
    if (numbered) {
      fromSpecs.push({
        ...numbered,
        ktruCode: currentKtru,
        name: numbered.name || currentName,
        position: numbered.position || currentPos,
      });
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

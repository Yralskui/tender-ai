/**
 * Подтягивает объёмы из карточки ЕИС, если в БД их нет (notice_enriched без файла ТЗ).
 */

import { parseEisKtruCatalogHtml } from "@/lib/eisKtruCatalogParser";
import type { TzVolume } from "@/lib/tzVolumes";

const FETCH_TIMEOUT_MS = 20_000;

export async function fetchTzVolumesFromEisNotice(
  regNumber: string,
  noticeType = "ea20"
): Promise<TzVolume[] | null> {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${regNumber}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TenderAI/1.0)" },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const parsed = parseEisKtruCatalogHtml(html);
    const volumes = (parsed?.tzVolumes || []).filter((v) => v.quantity > 0);
    return volumes.length > 0 ? volumes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function mergeEisVolumesIntoRequirements(
  requirements: Record<string, unknown>,
  volumes: TzVolume[]
): Record<string, unknown> {
  if (volumes.length === 0) return requirements;

  const volumeSpecs = volumes.map(
    (v) => `Объём закупки: ${v.quantity} ${v.unit || "шт"} — ${v.name || "позиция"}`
  );
  const existingSpecs = Array.isArray(requirements.productSpecs)
    ? (requirements.productSpecs as string[])
    : [];
  const withoutOldVolume = existingSpecs.filter((s) => !/^Объём\s+закупки:/i.test(s));

  return {
    ...requirements,
    tzVolumes: volumes,
    productSpecs: [...volumeSpecs, ...withoutOldVolume].slice(0, 320),
    volumesFetchedFromEisAt: new Date().toISOString(),
  };
}

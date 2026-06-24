/** Регионы для профиля компании (фильтр / matching). Пустая строка = все регионы. */
export const COMPANY_REGIONS = [
  "Москва",
  "Санкт-Петербург",
  "Московская область",
  "Краснодарский край",
  "Свердловская область",
  "Республика Татарстан",
  "Новосибирская область",
  "Нижегородская область",
  "Ростовская область",
  "Самарская область",
  "Красноярский край",
  "Челябинская область",
  "Другой регион",
] as const;

export function normalizeCompanyRegion(region: unknown): string | null {
  if (region == null) return null;
  const trimmed = String(region).trim();
  if (!trimmed || /^все\s+регион/i.test(trimmed)) return null;
  return trimmed;
}

export function regionOptionsForSelect(savedRegion: string | null | undefined): string[] {
  const base: string[] = [...COMPANY_REGIONS];
  const saved = savedRegion?.trim();
  if (saved && !base.includes(saved)) {
    base.push(saved);
  }
  return base;
}

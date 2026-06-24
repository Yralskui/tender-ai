/**
 * Ссылки на zakupki.gov.ru и торговые площадки.
 * Демо-тендеры (GEN*, невалидный номер ЕИС) → поиск, не битая карточка 404.
 */

export interface TenderExternalLink {
  url: string;
  /** direct = карточка извещения, search = поиск по номеру/названию */
  mode: "direct" | "search";
  label: string;
  hint?: string;
}

/** Номер извещения 44-ФЗ в ЕИС — 19 цифр */
export function isEisRegNumber(externalId: string): boolean {
  return /^\d{19}$/.test(externalId.trim());
}

/** Сгенерированный тендер без реальной записи в ЕИС */
export function isDemoTenderExternalId(externalId: string): boolean {
  const id = externalId.trim().toUpperCase();
  return id.startsWith("GEN") || id.startsWith("DEMO") || id.startsWith("MOCK");
}

export function shouldUseEisSearch(externalId: string, isDemo?: boolean): boolean {
  if (isDemo) return true;
  if (isDemoTenderExternalId(externalId)) return true;
  return !isEisRegNumber(externalId);
}

function noticeTypeFromProcedure(procedureType?: string | null): string {
  const lower = (procedureType || "").toLowerCase();
  if (lower.includes("конкурс")) return "ok504";
  if (lower.includes("котиров")) return "zk20";
  if (lower.includes("запрос предложений")) return "zp504";
  if (lower.includes("единственный")) return "ezt20";
  return "ea44";
}

/** Прямая карточка извещения на zakupki.gov.ru */
export function buildZakupkiUrl(externalId: string, procedureType?: string | null): string {
  const reg = externalId.trim();
  if (!reg) return "https://zakupki.gov.ru/epz/main/public/home.html";

  const notice = noticeTypeFromProcedure(procedureType);
  return `https://zakupki.gov.ru/epz/order/notice/${notice}/view/common-info.html?regNumber=${reg}`;
}

/** Поиск закупок на ЕИС */
export function buildZakupkiSearchUrl(query: string, procedureType?: string | null): string {
  const q = query.trim().slice(0, 200);
  const params = new URLSearchParams({
    searchString: q,
    morphology: "on",
    order: "date_pub desc",
    pageNumber: "1",
    fz44: "on",
    af: "on",
  });

  const lower = (procedureType || "").toLowerCase();
  if (lower.includes("котиров")) params.set("zk20", "on");
  else if (lower.includes("конкурс")) params.set("ok504", "on");
  else params.set("ea44", "on");

  return `https://zakupki.gov.ru/epz/order/extendedsearch/results.html?${params}`;
}

export function resolveTenderEisLink(
  externalId: string,
  options: {
    procedureType?: string | null;
    title?: string;
    isDemo?: boolean;
    sourceUrl?: string | null;
  } = {}
): TenderExternalLink {
  const useSearch = shouldUseEisSearch(externalId, options.isDemo);

  if (!useSearch) {
    const direct = buildZakupkiUrl(externalId, options.procedureType);
    if (
      options.sourceUrl &&
      options.sourceUrl.includes("regNumber=") &&
      options.sourceUrl !== "https://zakupki.gov.ru"
    ) {
      return {
        url: options.sourceUrl,
        mode: "direct",
        label: "Извещение на zakupki.gov.ru",
        hint: `№ ${externalId}`,
      };
    }
    return {
      url: direct,
      mode: "direct",
      label: "Извещение на zakupki.gov.ru",
      hint: `№ ${externalId}`,
    };
  }

  const searchQuery = isEisRegNumber(externalId)
    ? externalId
    : options.title?.trim() || "медицинские изделия";

  return {
    url: buildZakupkiSearchUrl(searchQuery, options.procedureType),
    mode: "search",
    label: "Найти на zakupki.gov.ru",
    hint: isDemoTenderExternalId(externalId)
      ? "Учебный тендер — откроется поиск похожих закупок на ЕИС"
      : "Поиск по названию или номеру извещения",
  };
}

/** @deprecated Используйте resolveTenderEisLink */
export function resolveTenderSourceUrl(
  externalId: string,
  sourceUrl: string | null | undefined,
  procedureType?: string | null
): string {
  return resolveTenderEisLink(externalId, { sourceUrl, procedureType }).url;
}

/** Прямая карточка закупки на ЭТП (не главная страница площадки) */
function isPlatformDirectPurchaseUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (!u.startsWith("http")) return false;
  return /\/(trade|purchase|auction|procedure|lot|tender|view|procedurecard)\//i.test(u);
}

function normalizePlatformBaseUrl(platformName: string, platformBaseUrl?: string): string {
  const name = platformName.toLowerCase();
  if (name.includes("ртс")) return "https://zakupki-satadmin.rts-tender.ru";
  const raw = (platformBaseUrl || "https://zakupki.gov.ru").replace(/\/$/, "");
  return raw.replace(/^http:/, "https:");
}

/** Ссылка на закупку на ЭТП (поиск по номеру ЕИС или по названию) */
export function resolvePlatformTenderLink(
  platformName: string,
  platformBaseUrl: string | undefined,
  externalId: string,
  options: { title?: string; isDemo?: boolean } = {}
): TenderExternalLink {
  const name = String(platformName || "").toLowerCase();
  const useSearch = shouldUseEisSearch(externalId, options.isDemo);
  const query = useSearch
    ? (options.title?.trim() || "медицинские изделия").slice(0, 150)
    : externalId.trim();
  const q = encodeURIComponent(query);

  if (platformBaseUrl && isPlatformDirectPurchaseUrl(platformBaseUrl)) {
    return {
      url: platformBaseUrl.replace(/^http:/, "https:"),
      mode: "direct",
      label: `Открыть на ${platformName || "площадке"}`,
      hint: `№ извещения ${externalId}`,
    };
  }

  if (name.includes("ртс")) {
    // /Search/Index на www.rts-tender.ru устарел (404); актуальный поиск — zakupki-satadmin
    return {
      url: "https://zakupki-satadmin.rts-tender.ru/?fl=True",
      mode: "search",
      label: useSearch ? "Найти на РТС-Тендер" : "Открыть на РТС-Тендер",
      hint: useSearch
        ? `В поиске введите название закупки`
        : `В поиске укажите номер в ЕИС: ${externalId}`,
    };
  }

  if (name.includes("сбер")) {
    return {
      url: `https://www.sberbank-ast.ru/ZK/PurchaseList/PurchaseList.aspx?searchText=${q}`,
      mode: "search",
      label: useSearch ? "Найти на Сбербанк-АСТ" : "Открыть на Сбербанк-АСТ",
      hint: useSearch ? "Поиск по названию закупки" : `№ ${externalId}`,
    };
  }

  if (name.includes("росэл") || name.includes("еэтп")) {
    return {
      url: `https://www.roseltorg.ru/procedures/search?searchString=${q}`,
      mode: "search",
      label: useSearch ? "Найти на Росэлторг" : "Открыть на Росэлторг",
      hint: useSearch ? "Поиск по названию" : `№ ${externalId}`,
    };
  }

  if (name.includes("тэк")) {
    return {
      url: `https://www.tektorg.ru/search/?q=${q}`,
      mode: "search",
      label: useSearch ? "Найти на ТЭК-Торг" : "Открыть на ТЭК-Торг",
      hint: useSearch ? "Поиск по названию" : `№ ${externalId}`,
    };
  }

  if (name.includes("заказрф")) {
    return {
      url: `https://www.zakazrf.ru/Search/Search?Query=${q}`,
      mode: "search",
      label: useSearch ? "Найти на ЗаказРФ" : "Открыть на ЗаказРФ",
      hint: useSearch ? "Поиск по названию" : `№ ${externalId}`,
    };
  }

  const base = normalizePlatformBaseUrl(platformName, platformBaseUrl);
  return {
    url: useSearch ? buildZakupkiSearchUrl(query) : `${base}/`,
    mode: "search",
    label: "Открыть площадку",
    hint: useSearch ? "Поиск по названию на ЕИС" : `Поиск на площадке · № ${externalId}`,
  };
}

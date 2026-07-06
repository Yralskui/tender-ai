/**
 * Каталог из названия файла РУ, когда скан не читается.
 */

const GENERIC_RU_LABELS: RegExp[] = [
  /^комплекты?\s+медицинск/i,
  /^медицинск\w*\s+комплект/i,
  /^стерильн\w*\s+издели/i,
  /^издели\w*\s+медицинск/i,
  /^медицинск\w*\s+издели/i,
  /^средства\s+медицинск/i,
];

const ABBREV_EXPANSIONS: Array<{ re: RegExp; label: string }> = [
  { re: /^прост\.?$/i, label: "Простыня стерильная" },
  { re: /^плен\.?$/i, label: "Плёнка стерильная" },
  { re: /^пелен\.?$/i, label: "Пелёнка стерильная" },
  { re: /^чех\.?$/i, label: "Чехол стерильный" },
  { re: /^салф\.?$/i, label: "Салфетка стерильная" },
  { re: /^хал\.?$/i, label: "Халат стерильный" },
  { re: /^шап\.?$/i, label: "Шапочка медицинская" },
];

const PRODUCT_SHORTCUTS: Array<{ re: RegExp; label: string }> = [
  { re: /шапоч/i, label: "Шапочка медицинская" },
  { re: /шап\.?\s*\d/i, label: "Шапочка медицинская" },
  { re: /^шап\b/i, label: "Шапочка медицинская" },
  { re: /бахил/i, label: "Бахилы медицинские" },
  { re: /покрыти/i, label: "Покрытие медицинское" },
  { re: /простын/i, label: "Простыня" },
  { re: /пелёнк|пеленк/i, label: "Пелёнка" },
  { re: /комплект.*одежд/i, label: "Комплект одежды хирургической" },
  { re: /комплект.*бель/i, label: "Комплект белья медицинского" },
];

export function isGenericRuCatalogLabel(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) return true;
  if (GENERIC_RU_LABELS.some((re) => re.test(t))) return true;
  if (/^комплект\s+(белья|одежды)\s+(медицинск|хирургическ)/i.test(t)) return true;
  if (/^(стерильн|медицинск|комплект)\w*$/i.test(t)) return true;
  return false;
}

function expandAbbrevToken(token: string): string | null {
  const clean = token.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (clean.length < 2) return null;
  for (const { re, label } of ABBREV_EXPANSIONS) {
    if (re.test(clean)) return label;
  }
  if (/^простын/i.test(clean)) return "Простыня стерильная";
  if (/^плёнк|^пленк/i.test(clean)) return "Плёнка стерильная";
  if (/^пелёнк|^пеленк/i.test(clean)) return "Пелёнка стерильная";
  if (/^чехол|^чех/i.test(clean)) return "Чехол стерильный";
  return null;
}

function expandProductShortcut(title: string): string | null {
  for (const { re, label } of PRODUCT_SHORTCUTS) {
    if (re.test(title)) return label;
  }
  return null;
}

export function normalizeRuFilenameTitle(title: string): string {
  let t = title
    .replace(/\s+/g, " ")
    .replace(/[+_]/g, " ")
    .replace(/№/g, " ")
    .trim();

  t = t.replace(/к-ты/gi, "Комплекты");
  t = t.replace(/к-т(?=\s|$|[.,(])/gi, "Комплект");
  t = t.replace(/кх(?=\s|$)/gi, "Комплект хирургический");
  t = t.replace(/ стер(?=\s|\)|$)/gi, " стерильные");
  t = t.replace(/^стер(?=\s|\)|$)/gi, "стерильные");
  t = t.replace(/нестер/gi, "нестерильные");
  t = t.replace(/ ВМ(?=\s|$|[.,)])/g, " для вмешательств");
  t = t.replace(/^ВМ(?=\s|$|[.,)])/g, "для вмешательств");
  t = t.replace(/\bмед\.?\b/gi, "медицинские");
  t = t.replace(/\s*с\s+печатью\s*$/i, "");
  t = t.replace(/\s*нов\.?\s*адрес\s*/gi, " ");
  t = t.replace(/\s*медсервис\s*/gi, " ");
  t = t.replace(/\s+/g, " ").trim();

  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}

function stripRuFilenameMeta(fileName: string): string {
  let t = fileName
    .replace(/\.(pdf|jpg|png|jpeg|webp)$/i, "")
    .replace(/^загрузить\s*:\s*/i, "")
    .trim();

  t = t.replace(/^ру[_\s-]*/i, "");
  t = t.replace(/(?:№\s*)?рзн[\s№#:_-]*\d{4}[-_/\s]?\d+/gi, " ");
  t = t.replace(/(?:№\s*)?фср[\s№#:]*\d{4}[\s/\-_]*\d+/gi, " ");
  t = t.replace(/\s*от\s*\d{2}[.\-/]\d{2}[.\-/]\d{2,4}/gi, " ");
  t = t.replace(/\s*\(\d+\)\s*$/i, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function expandProductTitle(title: string): string[] {
  const normalized = normalizeRuFilenameTitle(title);
  const paren = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);

  if (paren) {
    const base = normalizeRuFilenameTitle(paren[1].trim());
    const tokens = paren[2]
      .split(/[,;+]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    const out: string[] = [];
    if (base.length >= 6 && !isGenericRuCatalogLabel(base)) {
      out.push(base);
    }

    for (const token of tokens) {
      const expanded = expandAbbrevToken(token);
      if (expanded && !out.some((x) => x.toLowerCase() === expanded.toLowerCase())) {
        out.push(expanded);
      }
    }

    if (out.length > 0) return out;
  }

  const shortcut = expandProductShortcut(title);
  if (shortcut && isGenericRuCatalogLabel(shortcut)) {
    // shortcut слишком общий — попробуем полное название из файла
  } else if (shortcut) {
    return [shortcut];
  }

  const single = normalized.trim();
  if (single.length >= 6 && !isGenericRuCatalogLabel(single)) return [single];
  if (shortcut) return [shortcut];
  return [];
}

/** Конкретные позиции каталога из имени файла РУ */
export function parseRuFilenameCatalog(fileName: string): string[] {
  const productPart = stripRuFilenameMeta(fileName);
  if (productPart.length < 4 || /^загрузить/i.test(productPart)) {
    return [];
  }

  const items = expandProductTitle(productPart);
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key) || isGenericRuCatalogLabel(item)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique.slice(0, 24);
}

export function sanitizeRuCatalogProducts(products: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of products) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || isGenericRuCatalogLabel(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

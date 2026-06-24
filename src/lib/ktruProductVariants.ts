/**
 * Варианты одной КТРУ-позиции: в ООЗ часто 1 наименование и много блоков с разными халатами/размерами.
 */

import { isKtruCode, normalizeTzSpecText, stripKtruCode } from "@/lib/textNormalize";
import type { KtruProductBlock } from "@/lib/docxTableParser";
import { isGenericProcurementTitle, looksLikeProductName, isPlaceholderPositionName } from "@/lib/tzSanitizer";

const VARIANT_HEADER_RE =
  /^(халат\s+хирургическ|халат\s+изготовлен|халат\s+должен|халат\s+укомплектован|халат\s+с\s+|крой\s+халата|полностью\s+влагонепроницаем)/i;

const NUMBERED_PRODUCT_RE =
  /^(чехол|халат|простын|салфет|маск|перчат|бахил|костюм|комбинезон|лента|карман|бинт|мешок|пеленк|шапоч|колпач|фартук|сорочк)/i;

function stripVariantPrefix(text: string): string {
  return normalizeTzSpecText(text)
    .replace(/^\d+\.\s*/, "")
    .replace(/,\s*шт\.?.*$/i, "")
    .replace(/\s*параметры\s+технического\s+задания[\s\S]*$/i, "")
    .trim();
}

/** «1. Халат хирургический, шт.: 1» → «Халат хирургический» */
export function extractNumberedProductLabel(text: string): string | null {
  const t = normalizeTzSpecText(text);
  const m = t.match(/^\d+\.\s*(.+)$/i);
  if (!m) return null;
  let name = m[1]
    .replace(/\s*параметры\s+технического\s+задания[\s\S]*$/i, "")
    .replace(/,\s*шт\.?\s*:?.*$/i, "")
    .replace(/:\s*>=?\s*[\d.,]+.*$/i, "")
    .replace(/,\s*шт\.?$/i, "")
    .trim();
  if (name.length < 5) return null;
  if (NUMBERED_PRODUCT_RE.test(name)) return name;
  if (looksLikeProductName(name) && !isKtruCode(name)) return name;
  return null;
}

function extractPurposeLabel(block: KtruProductBlock): string | null {
  const ch = block.characteristics.find((c) => /^назначение/i.test(c.name.trim()));
  if (!ch) return null;
  const raw = ch.value?.trim() || ch.name.replace(/^назначение\s*:?\s*/i, "");
  const purpose = normalizeTzSpecText(raw)
    .replace(/параметры\s+технического\s+задания[\s\S]*$/i, "")
    .trim();
  if (purpose.length < 8) return null;
  return `Набор хирургический (${purpose.slice(0, 60)})`;
}

function numberedProductsInBlock(block: KtruProductBlock): string[] {
  const found: string[] = [];
  for (const ch of block.characteristics) {
    const label = extractNumberedProductLabel(ch.name);
    if (label && !found.includes(label)) found.push(label);
  }
  return found;
}

export function isKtruVariantHeaderChar(name: string, value: string): boolean {
  const n = stripVariantPrefix(name);
  const v = normalizeTzSpecText(value).toLowerCase();
  if (n.length < 12) return false;
  if (!VARIANT_HEADER_RE.test(n)) return false;
  return (
    v === "соответствие" ||
    v === "наличие" ||
    v === "шт" ||
    v === "" ||
    /^[\d.,]+$/.test(v)
  );
}

export function findBlockSizeLabel(block: KtruProductBlock): string | null {
  for (const ch of block.characteristics) {
    if (/^размер\s+халата$/i.test(ch.name.trim()) && /\d/.test(ch.value)) {
      return ch.value.trim();
    }
    if (/^размер\s+\d{2}\s*[-–]\s*\d{2}$/i.test(ch.name.trim()) && /соответствие/i.test(ch.value)) {
      return ch.name.replace(/^размер\s*/i, "").replace(/\s+/g, "");
    }
    const inline = ch.name.match(/^размер\s+(\d{2}\s*[-–]\s*\d{2})/i);
    if (inline && /соответствие/i.test(ch.value)) {
      return inline[1].replace(/\s+/g, "");
    }
  }
  return null;
}

function composeKitLabel(products: string[], size: string | null): string {
  if (products.length === 0) return "";
  const head = products.slice(0, 2).join(" + ");
  const extra = products.length > 2 ? ` + ещё ${products.length - 2}` : "";
  const sizePart = size ? ` (размер ${size})` : "";
  return `${head}${extra}${sizePart}`;
}

/** Читаемое имя изделия: не код КТРУ и не заголовок закупки */
export function resolveBlockProductLabel(block: KtruProductBlock): string {
  let base = normalizeTzSpecText(block.name)
    .replace(/обоснование\s+включения[\s\S]*$/i, "")
    .trim();
  if (isKtruCode(base)) base = "";
  if (base) base = stripKtruCode(base);

  for (const ch of block.characteristics) {
    if (/наименование\s+медицинск/i.test(ch.name) && ch.value && ch.value.length >= 6) {
      const v = normalizeTzSpecText(ch.value);
      if (looksLikeProductName(v) && !isGenericProcurementTitle(v)) return v;
    }
  }

  const purpose = extractPurposeLabel(block);
  const numbered = numberedProductsInBlock(block);
  const size = findBlockSizeLabel(block);

  if (purpose && numbered.length >= 2) return purpose;
  if (numbered.length >= 2) return composeKitLabel(numbered, size) || purpose || numbered[0];
  if (numbered.length === 1) {
    return size ? `${numbered[0]} (размер ${size})` : numbered[0];
  }
  if (purpose) return purpose;

  const header = block.characteristics.find((ch) => isKtruVariantHeaderChar(ch.name, ch.value));
  if (header && (isGenericProcurementTitle(base) || !looksLikeProductName(base) || !base)) {
    return stripVariantPrefix(header.name);
  }

  const productChar = block.characteristics.find(
    (ch) =>
      NUMBERED_PRODUCT_RE.test(ch.name) &&
      /соответствие|наличие/i.test(ch.value)
  );
  if (productChar && (isGenericProcurementTitle(base) || !base)) {
    return normalizeTzSpecText(productChar.name);
  }

  if (base && looksLikeProductName(base) && !isGenericProcurementTitle(base) && !isPlaceholderPositionName(base)) {
    return size ? `${base} (размер ${size})` : base;
  }
  if (base.length >= 8 && !isKtruCode(base) && !isPlaceholderPositionName(base)) return base;

  const derived = deriveBlockVariantName(block);
  if (derived && !isPlaceholderPositionName(derived) && looksLikeProductName(derived)) return derived;
  return derived || `Позиция ${block.position || "?"}`;
}

export function deriveBlockVariantName(block: KtruProductBlock): string {
  const purpose = extractPurposeLabel(block);
  const numbered = numberedProductsInBlock(block);
  const size = findBlockSizeLabel(block);

  if (purpose) return purpose;
  if (numbered.length >= 2) {
    const kit = composeKitLabel(numbered, size);
    if (kit) return kit;
  }
  if (numbered.length === 1) {
    return size ? `${numbered[0]} (размер ${size})` : numbered[0];
  }

  const header = block.characteristics.find((ch) => isKtruVariantHeaderChar(ch.name, ch.value));
  let core = header ? stripVariantPrefix(header.name) : "";

  if (!core) {
    let base = normalizeTzSpecText(block.name);
    if (isKtruCode(base)) base = "";
    else core = stripKtruCode(base);
  }

  if (core.length > 110) {
    core = core.slice(0, 107) + "…";
  }

  if (size && core) {
    return `${core} (размер ${size})`;
  }
  if (block.position && core) {
    return `${core} (поз. ${block.position})`;
  }
  return core || `Позиция ${block.position || "?"}`;
}

export function buildLineVolumesFromNmck(
  items: Array<{ position: string; name: string; ktruCode: string; quantity: string; unit: string }>,
  variantNamesByPosition: Map<string, string>
): Array<{ name: string; ktruCode: string; quantity: number; unit: string; position: string }> {
  return items.map((item) => {
    const qty = parseInt(String(item.quantity).replace(/[^\d]/g, ""), 10) || 1;
    const unit = /штук/i.test(item.unit) ? "шт" : item.unit || "шт";
    const fromVariant = variantNamesByPosition.get(item.position);
    const fromName = isKtruCode(item.name) ? "" : stripKtruCode(item.name);
    const variantName = fromVariant && !isKtruCode(fromVariant) ? fromVariant : fromName || fromVariant || item.name;
    return {
      name: variantName,
      ktruCode: item.ktruCode,
      quantity: qty,
      unit,
      position: item.position,
    };
  });
}

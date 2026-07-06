import { prisma } from "@/lib/prisma";
import type { StructuredCatalogItem } from "@/lib/productDimensions";
import { normalizeMatchText } from "@/lib/productFamilies";

export interface CatalogDocSlice {
  isRelevant?: boolean;
  products?: string[];
  catalogItems?: StructuredCatalogItem[];
}

function catalogLineKey(text: string): string {
  return normalizeMatchText(text).slice(0, 120);
}

/**
 * Объединяет позиции из CatalogProduct (с размерами) и строки из extractedData документов.
 * Раньше при наличии хотя бы одной строки в БД игнорировались шапочки/комплекты только в JSON РУ.
 */
export function mergeCompanyCatalogSources(input: {
  catalogRows: CatalogProductRow[];
  docsForMatching: CatalogDocSlice[];
  fallbackProducts?: string[];
}): { catalogProducts: string[]; catalogStructured: StructuredCatalogItem[] } {
  const structuredFromRows = catalogRowsToStructured(input.catalogRows);
  const relevantDocs = input.docsForMatching.filter((d) => d.isRelevant !== false);

  const structuredFromDocs = relevantDocs.flatMap((d) => d.catalogItems || []);
  const productLinesFromDocs = relevantDocs.flatMap((d) => d.products || []);

  const seenStructured = new Set<string>();
  const catalogStructured: StructuredCatalogItem[] = [];

  for (const item of [...structuredFromRows, ...structuredFromDocs]) {
    const key = catalogLineKey(item.displayText || item.name || item.rawText);
    if (!key || seenStructured.has(key)) continue;
    seenStructured.add(key);
    catalogStructured.push(item);
  }

  const seenProducts = new Set(catalogStructured.map((s) => catalogLineKey(s.displayText || s.name)));
  const catalogProducts = catalogStructured.map((s) => s.displayText || s.name);

  const extraLines = [
    ...productLinesFromDocs,
    ...(input.fallbackProducts || []),
  ];
  for (const line of extraLines) {
    const key = catalogLineKey(line);
    if (!key || seenProducts.has(key)) continue;
    seenProducts.add(key);
    catalogProducts.push(line);
  }

  return { catalogProducts, catalogStructured };
}

export interface CatalogProductRow {
  id: string;
  documentId: string;
  companyId: string;
  position: number;
  name: string;
  rawText: string;
  displayText: string;
  lengthMinMm: number | null;
  lengthMaxMm: number | null;
  widthMinMm: number | null;
  widthMaxMm: number | null;
  heightMinMm: number | null;
  heightMaxMm: number | null;
  unitSource: string;
  quantityText: string | null;
}

type CatalogDelegate = {
  deleteMany: (args: { where: { documentId: string } }) => Promise<unknown>;
  createMany: (args: { data: unknown[] }) => Promise<unknown>;
  findMany: (args: {
    where: { companyId: string };
    orderBy: Array<{ documentId: "asc" } | { position: "asc" }>;
  }) => Promise<CatalogProductRow[]>;
};

function catalogDelegate(): CatalogDelegate | null {
  const delegate = (prisma as unknown as { catalogProduct?: CatalogDelegate }).catalogProduct;
  return delegate ?? null;
}

function dimToColumns(item: StructuredCatalogItem) {
  const { dimensions: d } = item;
  return {
    lengthMinMm: d.length?.minMm ?? null,
    lengthMaxMm: d.length?.maxMm ?? null,
    widthMinMm: d.width?.minMm ?? null,
    widthMaxMm: d.width?.maxMm ?? null,
    heightMinMm: d.height?.minMm ?? null,
    heightMaxMm: d.height?.maxMm ?? null,
    unitSource: d.length?.sourceUnit ?? d.width?.sourceUnit ?? "cm",
  };
}

/** Сохраняет позиции каталога из РУ в БД (перезапись по documentId). */
export async function syncCatalogProductsToDb(
  documentId: string,
  companyId: string,
  items: StructuredCatalogItem[]
): Promise<number> {
  const catalog = catalogDelegate();
  if (!catalog) {
    console.warn("CatalogProduct model unavailable — перезапустите dev-сервер после prisma generate");
    return 0;
  }

  await catalog.deleteMany({ where: { documentId } });

  if (items.length === 0) return 0;

  await catalog.createMany({
    data: items.map((item, position) => ({
      documentId,
      companyId,
      position,
      name: item.name,
      rawText: item.rawText,
      displayText: item.displayText,
      quantityText: item.quantityText ?? null,
      ...dimToColumns(item),
    })),
  });

  return items.length;
}

export async function loadCompanyCatalogProducts(
  companyId: string
): Promise<CatalogProductRow[]> {
  const catalog = catalogDelegate();
  if (!catalog) return [];

  try {
    return await catalog.findMany({
      where: { companyId },
      orderBy: [{ documentId: "asc" }, { position: "asc" }],
    });
  } catch (e) {
    console.error("loadCompanyCatalogProducts failed:", e);
    return [];
  }
}

export function catalogRowsToStructured(rows: CatalogProductRow[]): StructuredCatalogItem[] {
  return rows.map((r) => ({
    name: r.name,
    rawText: r.rawText,
    displayText: r.displayText,
    quantityText: r.quantityText ?? undefined,
    dimensions: {
      ...(r.lengthMinMm != null
        ? {
            length: {
              minMm: r.lengthMinMm,
              maxMm: r.lengthMaxMm ?? r.lengthMinMm,
              sourceUnit: (r.unitSource as "cm" | "mm") || "cm",
              sourceLabel: "",
            },
          }
        : {}),
      ...(r.widthMinMm != null
        ? {
            width: {
              minMm: r.widthMinMm,
              maxMm: r.widthMaxMm ?? r.widthMinMm,
              sourceUnit: (r.unitSource as "cm" | "mm") || "cm",
              sourceLabel: "",
            },
          }
        : {}),
      ...(r.heightMinMm != null
        ? {
            height: {
              minMm: r.heightMinMm,
              maxMm: r.heightMaxMm ?? r.heightMinMm,
              sourceUnit: (r.unitSource as "cm" | "mm") || "cm",
              sourceLabel: "",
            },
          }
        : {}),
    },
  }));
}

import { prisma } from "@/lib/prisma";
import type { ParsedSupplierPriceItem } from "@/lib/pricelistParser";
import { parsePricelistPdfBuffer } from "@/lib/pricelistParser";

export interface SupplierPriceRow {
  id: string;
  documentId: string;
  companyId: string;
  position: number;
  name: string;
  displayName: string;
  vendor: string | null;
  unit: string;
  unitPrice: number;
  unitPriceSterile: number | null;
  priceBasis: string;
  thicknessUm: number | null;
  densityGsm: number | null;
  sizeText: string | null;
  colorText: string | null;
  materialText: string | null;
  packRatio: string | null;
  elasticType: string | null;
  categoryText: string | null;
}

export async function syncSupplierPricesToDb(
  documentId: string,
  companyId: string,
  items: ParsedSupplierPriceItem[]
): Promise<number> {
  await prisma.supplierPriceItem.deleteMany({ where: { documentId } });
  if (items.length === 0) return 0;

  await prisma.supplierPriceItem.createMany({
    data: items.map((item, position) => ({
      documentId,
      companyId,
      position,
      name: item.name,
      displayName: item.displayName,
      vendor: item.vendor ?? null,
      unit: item.unit,
      unitPrice: item.unitPrice,
      unitPriceSterile: item.unitPriceSterile ?? null,
      priceBasis: item.priceBasis,
      thicknessUm: item.thicknessUm ?? null,
      densityGsm: item.densityGsm ?? null,
      sizeText: item.sizeText ?? null,
      colorText: item.colorText ?? null,
      materialText: item.materialText ?? null,
      packRatio: item.packRatio ?? null,
      elasticType: item.elasticType ?? null,
      categoryText: item.categoryText ?? null,
    })),
  });

  return items.length;
}

export interface SupplierPricelistInfo {
  documentId: string;
  label: string;
  vendor: string | null;
}

function pricelistLabelFromDocument(doc: { name: string; extractedData: string }): {
  label: string;
  vendor: string | null;
} {
  let vendor: string | null = null;
  try {
    const data = JSON.parse(doc.extractedData || "{}") as { vendor?: string };
    vendor = data.vendor?.trim() || null;
  } catch {
    /* ignore */
  }

  const fileStem = doc.name.replace(/\.(pdf|xlsx?|docx?)$/i, "").trim();
  const shortFile = fileStem.length > 42 ? `${fileStem.slice(0, 39)}…` : fileStem;
  const label = vendor && !shortFile.toLowerCase().includes(vendor.toLowerCase())
    ? `${vendor} · ${shortFile}`
    : shortFile;

  return { label, vendor };
}

export async function loadCompanySupplierPriceCatalog(companyId: string): Promise<{
  pricelists: SupplierPricelistInfo[];
  items: SupplierPriceRow[];
}> {
  const rows = await prisma.supplierPriceItem.findMany({
    where: { companyId },
    include: { document: { select: { id: true, name: true, extractedData: true } } },
    orderBy: [{ documentId: "asc" }, { position: "asc" }],
  });

  const pricelists: SupplierPricelistInfo[] = [];
  const seen = new Set<string>();
  const items: SupplierPriceRow[] = [];

  for (const row of rows) {
    if (!seen.has(row.documentId)) {
      seen.add(row.documentId);
      const { label, vendor } = pricelistLabelFromDocument(row.document);
      pricelists.push({ documentId: row.documentId, label, vendor });
    }

    items.push({
      id: row.id,
      documentId: row.documentId,
      companyId: row.companyId,
      position: row.position,
      name: row.name,
      displayName: row.displayName,
      vendor: row.vendor,
      unit: row.unit,
      unitPrice: row.unitPrice,
      unitPriceSterile: row.unitPriceSterile,
      priceBasis: row.priceBasis,
      thicknessUm: row.thicknessUm,
      densityGsm: row.densityGsm,
      sizeText: row.sizeText,
      colorText: row.colorText,
      materialText: row.materialText,
      packRatio: row.packRatio,
      elasticType: row.elasticType,
      categoryText: row.categoryText,
    });
  }

  return { pricelists, items };
}

export async function loadCompanySupplierPrices(companyId: string): Promise<SupplierPriceRow[]> {
  const { items } = await loadCompanySupplierPriceCatalog(companyId);
  return items;
}

export async function saveSupplierPriceDocument(
  documentId: string,
  companyId: string,
  items: ParsedSupplierPriceItem[],
  meta: { vendor?: string; validFrom?: string; fileName: string }
): Promise<{ count: number }> {
  const count = await syncSupplierPricesToDb(documentId, companyId, items);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "processed",
      type: "supplier_price",
      extractedData: JSON.stringify({
        isRelevant: true,
        docType: "supplier_price",
        docTypeLabel: "Нет-прайс поставщика",
        summary: `Прайс-лист: ${count} позиций${meta.vendor ? ` · ${meta.vendor}` : ""}`,
        vendor: meta.vendor ?? null,
        validFrom: meta.validFrom ?? null,
        productCount: count,
        priceItems: items.slice(0, 40).map((i) => ({
          name: i.name,
          unitPrice: i.unitPrice,
          unit: i.unit,
        })),
      }),
    },
  });

  return { count };
}

export function resolvePricelistVendor(displayName: string): string | undefined {
  if (/инмедиз/i.test(displayName)) return "Инмедиз";
  if (/спец\.?\s*цена/i.test(displayName)) return "Поставщик (спец.цена)";
  return undefined;
}

export async function ingestPricelistDocument(
  documentId: string,
  companyId: string,
  buffer: Buffer,
  displayName: string
): Promise<{ count: number; summary: string; warning: string | null }> {
  const items = await parsePricelistPdfBuffer(buffer, { fileName: displayName });
  const vendor = resolvePricelistVendor(displayName);
  const dateM = displayName.match(/(\d{2}[.\-]\d{2}[.\-]\d{2,4})/);
  const { count } = await saveSupplierPriceDocument(documentId, companyId, items, {
    vendor,
    validFrom: dateM?.[1],
    fileName: displayName,
  });
  return {
    count,
    summary: count > 0 ? `Разобрано ${count} позиций из прайс-листа` : "Не удалось извлечь позиции из PDF",
    warning: count === 0 ? "Проверьте формат файла или загрузите более чёткий PDF" : null,
  };
}

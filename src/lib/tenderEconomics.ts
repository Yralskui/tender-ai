/**
 * Экономика участия: объёмы из ТЗ × нет-прайс поставщика vs НМЦК.
 */

import {
  detectTextileSubTypes,
  normalizeMatchText,
  textileSubTypesCompatible,
} from "@/lib/productFamilies";
import type { SupplierPriceRow, SupplierPricelistInfo } from "@/lib/supplierPriceSync";

export interface TenderEconomicsPricelistMatch {
  documentId: string;
  pricelistLabel: string;
  matchedPriceName: string | null;
  vendor: string | null;
  unitPrice: number | null;
  lineCost: number | null;
  matchScore: number;
}

export interface TenderEconomicsLine {
  tenderItemName: string;
  quantity: number;
  unit: string;
  matchedPriceName: string | null;
  vendor: string | null;
  unitPrice: number | null;
  lineCost: number | null;
  matchScore: number;
  sterile?: boolean;
  pricelistMatches: TenderEconomicsPricelistMatch[];
}

export interface TenderEconomicsPricelistSummary {
  documentId: string;
  label: string;
  costTotal: number;
  marginRub: number | null;
  marginPercent: number | null;
  coveredLines: number;
}

export interface TenderEconomicsResult {
  lines: TenderEconomicsLine[];
  costTotal: number;
  nmck: number;
  marginRub: number | null;
  marginPercent: number | null;
  coveredLines: number;
  totalLines: number;
  hasPrices: boolean;
  pricelists: SupplierPricelistInfo[];
  pricelistSummaries: TenderEconomicsPricelistSummary[];
  multiPricelist: boolean;
}

interface TenderVolume {
  name?: string;
  quantity: number;
  unit?: string;
  position?: string;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeMatchText(text)
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
  );
}

function wantsSterileProduct(tenderName: string): boolean {
  const t = tenderName.toLowerCase();
  if (/нестерил/i.test(t)) return false;
  if (/стерил/i.test(t)) return true;
  return false;
}

function scorePriceMatch(tenderName: string, price: SupplierPriceRow): number {
  const priceText = `${price.displayName} ${price.name}`;
  const tenderTypes = detectTextileSubTypes(tenderName);
  const priceTypes = detectTextileSubTypes(priceText);

  if (!textileSubTypesCompatible(tenderTypes, priceTypes)) {
    return 0;
  }

  const a = tokenSet(tenderName);
  const b = tokenSet(priceText);
  if (a.size === 0 || b.size === 0) return 0;

  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  let score = inter / Math.max(a.size, 4);

  const tn = tenderName.toLowerCase();
  const pn = priceText.toLowerCase();

  const tenderKind =
    (/бахил/i.test(tn) && "бахил") ||
    (/шапоч|берет|шарлот/i.test(tn) && "шапоч") ||
    (/маск/i.test(tn) && "маск") ||
    (/халат/i.test(tn) && "халат") ||
    (/простын/i.test(tn) && "простын") ||
    null;
  const priceKind =
    (/бахил/i.test(pn) && "бахил") ||
    (/шапоч|берет|шарлот/i.test(pn) && "шапоч") ||
    (/маск/i.test(pn) && "маск") ||
    (/халат/i.test(pn) && "халат") ||
    (/простын/i.test(pn) && "простын") ||
    null;

  if (tenderKind && priceKind && tenderKind !== priceKind) return 0;
  if (tenderKind && priceKind && tenderKind === priceKind) score += 0.35;

  if (/бахил/i.test(tn) && /бахил/i.test(pn)) score += 0.25;
  if (/шапоч|берет/i.test(tn) && /шапоч|берет|шарлот/i.test(pn)) score += 0.25;
  if (/маск/i.test(tn) && /маск/i.test(pn)) score += 0.25;
  if (/халат/i.test(tn) && /халат/i.test(pn)) score += 0.25;
  if (/простын/i.test(tn) && /простын/i.test(pn)) score += 0.25;

  const thickT = tn.match(/(\d{2,3})\s*мкм/);
  const thickP = pn.match(/(\d{2,3})\s*мкм/) || (price.thicknessUm ? [String(price.thicknessUm)] : null);
  if (thickT && thickP && thickT[1] === thickP[1]) score += 0.15;

  const sizeT = tn.match(/(\d{2})\s*[xх×]\s*(\d{2})/);
  const sizeP = pn.match(/(\d{2})\s*[xх×]\s*(\d{2})/) || (price.sizeText?.match(/(\d{2})\s*[xх×]\s*(\d{2})/) ?? null);
  if (sizeT && sizeP && sizeT[1] === sizeP[1] && sizeT[2] === sizeP[2]) score += 0.2;

  if (wantsSterileProduct(tenderName) && price.unitPriceSterile) score += 0.05;

  return Math.min(1, score);
}

function pickUnitPrice(price: SupplierPriceRow, tenderName: string): number {
  if (wantsSterileProduct(tenderName) && price.unitPriceSterile && price.unitPriceSterile > 0) {
    return price.unitPriceSterile;
  }
  return price.unitPrice;
}

function findBestPrice(tenderName: string, prices: SupplierPriceRow[]): { price: SupplierPriceRow; score: number } | null {
  let best: { price: SupplierPriceRow; score: number } | null = null;
  for (const price of prices) {
    const score = scorePriceMatch(tenderName, price);
    if (score < 0.45) continue;
    if (!best || score > best.score) best = { price, score };
  }
  return best;
}

function groupPricesByDocument(prices: SupplierPriceRow[]): Map<string, SupplierPriceRow[]> {
  const map = new Map<string, SupplierPriceRow[]>();
  for (const price of prices) {
    const list = map.get(price.documentId) ?? [];
    list.push(price);
    map.set(price.documentId, list);
  }
  return map;
}

function derivePricelists(prices: SupplierPriceRow[], pricelists: SupplierPricelistInfo[]): SupplierPricelistInfo[] {
  if (pricelists.length > 0) return pricelists;

  const ids = [...new Set(prices.map((p) => p.documentId))];
  return ids.map((documentId, index) => ({
    documentId,
    label: `Прайс ${index + 1}`,
    vendor: null,
  }));
}

function buildPricelistSummaries(
  lines: TenderEconomicsLine[],
  pricelists: SupplierPricelistInfo[],
  nmck: number
): TenderEconomicsPricelistSummary[] {
  return pricelists.map((pl) => {
    let costTotal = 0;
    let coveredLines = 0;

    for (const line of lines) {
      const match = line.pricelistMatches.find((m) => m.documentId === pl.documentId);
      if (match?.lineCost != null) {
        costTotal += match.lineCost;
        coveredLines++;
      }
    }

    costTotal = Math.round(costTotal * 100) / 100;
    const marginRub = coveredLines > 0 && nmck > 0 ? nmck - costTotal : null;
    const marginPercent =
      marginRub != null && costTotal > 0 ? Math.round((marginRub / nmck) * 100) : null;

    return {
      documentId: pl.documentId,
      label: pl.label,
      costTotal,
      marginRub: marginRub != null ? Math.round(marginRub * 100) / 100 : null,
      marginPercent,
      coveredLines,
    };
  });
}

function pickBestPricelistMatch(matches: TenderEconomicsPricelistMatch[]): TenderEconomicsPricelistMatch | null {
  const withCost = matches.filter((m) => m.lineCost != null);
  if (withCost.length === 0) {
    return matches.find((m) => m.matchedPriceName) ?? matches[0] ?? null;
  }
  return withCost.reduce((best, m) => (m.lineCost! < best.lineCost! ? m : best));
}

export function buildTenderEconomics(
  volumes: TenderVolume[],
  tenderTitle: string,
  nmck: number,
  prices: SupplierPriceRow[],
  pricelists: SupplierPricelistInfo[] = []
): TenderEconomicsResult {
  const lines: TenderEconomicsLine[] = [];
  const catalogPricelists = derivePricelists(prices, pricelists);
  const pricesByDoc = groupPricesByDocument(prices);
  const multiPricelist = catalogPricelists.length >= 2;

  const items =
    volumes.length > 0
      ? volumes
      : [{ name: tenderTitle.replace(/^поставка\s+/i, "").trim(), quantity: 1, unit: "шт" }];

  for (const vol of items) {
    const name = (vol.name || tenderTitle).trim();
    const qty = vol.quantity > 0 ? vol.quantity : 1;
    const unit = vol.unit || "шт";

    const pricelistMatches: TenderEconomicsPricelistMatch[] = catalogPricelists.map((pl) => {
      const docPrices = pricesByDoc.get(pl.documentId) ?? [];
      const match = docPrices.length > 0 ? findBestPrice(name, docPrices) : null;
      const unitPrice = match ? pickUnitPrice(match.price, name) : null;
      const lineCost = unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : null;

      return {
        documentId: pl.documentId,
        pricelistLabel: pl.label,
        matchedPriceName: match?.price.displayName ?? null,
        vendor: match?.price.vendor ?? pl.vendor,
        unitPrice,
        lineCost,
        matchScore: match?.score ?? 0,
      };
    });

    const best = pickBestPricelistMatch(pricelistMatches);

    lines.push({
      tenderItemName: name,
      quantity: qty,
      unit,
      matchedPriceName: best?.matchedPriceName ?? null,
      vendor: best?.vendor ?? null,
      unitPrice: best?.unitPrice ?? null,
      lineCost: best?.lineCost ?? null,
      matchScore: best?.matchScore ?? 0,
      sterile: wantsSterileProduct(name),
      pricelistMatches,
    });
  }

  const pricelistSummaries = buildPricelistSummaries(lines, catalogPricelists, nmck);
  const bestSummary =
    pricelistSummaries
      .filter((s) => s.coveredLines > 0)
      .sort((a, b) => a.costTotal - b.costTotal)[0] ?? pricelistSummaries[0];

  const covered = lines.filter((l) => l.lineCost != null);
  const costTotal = bestSummary?.costTotal ?? 0;
  const marginRub = bestSummary?.marginRub ?? null;
  const marginPercent = bestSummary?.marginPercent ?? null;

  return {
    lines,
    costTotal,
    nmck,
    marginRub,
    marginPercent,
    coveredLines: covered.length,
    totalLines: lines.length,
    hasPrices: prices.length > 0,
    pricelists: catalogPricelists,
    pricelistSummaries,
    multiPricelist,
  };
}

import { prisma } from "@/lib/prisma";
import { aiProvider, type DocumentAnalysis } from "@/lib/aiAnalysis";
import { syncCatalogProductsToDb } from "@/lib/catalogProductSync";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";

export async function saveDocumentAnalysis(
  documentId: string,
  companyId: string,
  analysis: DocumentAnalysis,
  options: { expiresAt?: Date | null; existingExpiresAt?: Date | null } = {}
): Promise<{ isRelevant: boolean; warning: string | null }> {
  const isRelevant = analysis.isRelevantForTenders === true;
  const finalType = isRelevant ? analysis.docType : "irrelevant";
  const warning = analysis.warning || (!isRelevant ? analysis.summary : null);

  let detectedExpiry: Date | undefined;
  if (analysis.validUntil && analysis.validUntil !== "бессрочно") {
    const parts = analysis.validUntil.split(/[.\-]/);
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d.getTime())) detectedExpiry = d;
    }
  }

  let resolved = analysis;
  if (isRelevant && (resolved.catalogItems?.length ?? 0) === 0 && (resolved.products?.length ?? 0) > 0) {
    resolved = {
      ...resolved,
      catalogItems: resolved.products.map((line) => ({
        name: line,
        rawText: line,
        displayText: line,
        dimensions: {},
      })),
    };
  }

  if (isRelevant && (resolved.catalogItems?.length ?? 0) > 0) {
    try {
      await syncCatalogProductsToDb(documentId, companyId, resolved.catalogItems);
    } catch (syncErr) {
      console.error(`Catalog sync failed for ${documentId}:`, syncErr);
    }
  } else if (!isRelevant || (resolved.catalogItems?.length ?? 0) === 0) {
    try {
      await prisma.catalogProduct.deleteMany({ where: { documentId } });
    } catch {
      /* модель может быть недоступна */
    }
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "processed",
      type: finalType,
      extractedData: JSON.stringify({
        aiProvider,
        docType: resolved.docType,
        docTypeLabel: resolved.docTypeLabel,
        issuedTo: resolved.issuedTo,
        issuedBy: resolved.issuedBy,
        number: resolved.number,
        validFrom: resolved.validFrom,
        validUntil: resolved.validUntil,
        summary: resolved.summary,
        detectedContent: resolved.detectedContent,
        confidence: resolved.confidence,
        isRelevant,
        warning,
        products: resolved.products,
        catalogItems: resolved.catalogItems ?? [],
        productCount: resolved.productCount,
        documentScope: resolved.documentScope,
        okpd2Code: resolved.okpd2Code,
      }),
      ...(detectedExpiry && !options.existingExpiresAt ? { expiresAt: detectedExpiry } : {}),
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    },
  });

  scheduleCompanyFeedCacheRebuild(companyId, { full: true });

  return { isRelevant, warning };
}

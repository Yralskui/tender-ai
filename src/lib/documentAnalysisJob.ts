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

  if (isRelevant && (analysis.catalogItems?.length ?? 0) > 0) {
    try {
      await syncCatalogProductsToDb(documentId, companyId, analysis.catalogItems);
    } catch (syncErr) {
      console.error(`Catalog sync failed for ${documentId}:`, syncErr);
    }
  } else if (!isRelevant || (analysis.catalogItems?.length ?? 0) === 0) {
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
        docType: analysis.docType,
        docTypeLabel: analysis.docTypeLabel,
        issuedTo: analysis.issuedTo,
        issuedBy: analysis.issuedBy,
        number: analysis.number,
        validFrom: analysis.validFrom,
        validUntil: analysis.validUntil,
        summary: analysis.summary,
        detectedContent: analysis.detectedContent,
        confidence: analysis.confidence,
        isRelevant,
        warning,
        products: analysis.products,
        catalogItems: analysis.catalogItems ?? [],
        productCount: analysis.productCount,
        documentScope: analysis.documentScope,
        okpd2Code: analysis.okpd2Code,
      }),
      ...(detectedExpiry && !options.existingExpiresAt ? { expiresAt: detectedExpiry } : {}),
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    },
  });

  scheduleCompanyFeedCacheRebuild(companyId, { full: true });

  return { isRelevant, warning };
}

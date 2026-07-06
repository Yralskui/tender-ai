/**
 * Выборки Document — без лишнего extractedData там, где нужны только метаданные.
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCompanyDocuments } from "@/lib/matching";

/** Для ранжирования ленты / matching */
export const DOCUMENT_FOR_MATCHING_SELECT = {
  id: true,
  name: true,
  type: true,
  fileUrl: true,
  expiresAt: true,
  extractedData: true,
  status: true,
  companyId: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

/** Только метаданные — счётчики, хеш кэша */
export const DOCUMENT_META_SELECT = {
  id: true,
  status: true,
  extractedData: true,
} satisfies Prisma.DocumentSelect;

export type DocumentForMatching = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_FOR_MATCHING_SELECT;
}>;

export type DocumentMeta = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_META_SELECT;
}>;

export async function loadDocumentsForMatching(companyId: string): Promise<DocumentForMatching[]> {
  return prisma.document.findMany({
    where: { companyId },
    select: DOCUMENT_FOR_MATCHING_SELECT,
  });
}

export async function loadDocumentsMeta(companyId: string): Promise<DocumentMeta[]> {
  return prisma.document.findMany({
    where: { companyId },
    select: DOCUMENT_META_SELECT,
  });
}

export function countRelevantDocuments(documents: Array<{ extractedData: string }>): number {
  return documents.filter((d) => {
    try {
      return JSON.parse(d.extractedData || "{}").isRelevant === true;
    } catch {
      return false;
    }
  }).length;
}

export function catalogProductsFromDocuments(
  documents: DocumentForMatching[]
): string[] {
  return mapCompanyDocuments(documents)
    .filter((d) => d.isRelevant && d.products?.length)
    .flatMap((d) => d.products || []);
}

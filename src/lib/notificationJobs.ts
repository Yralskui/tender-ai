/**
 * Фоновые задачи уведомлений: после синка, дедлайны, истечение документов.
 */

import { prisma } from "@/lib/prisma";
import { buildCompanyFocus } from "@/lib/companyFocus";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "@/lib/catalogProductSync";
import { mapCompanyDocuments } from "@/lib/matching";
import { loadDocumentsForMatching } from "@/lib/documentQuery";
import { rankTenderForFeed } from "@/lib/tenderRanking";
import {
  getUsersWithAccess,
  notifyDeadline,
  notifyDocExpiry,
  notifyTenderAfterSync,
  sendPendingDigestEmails,
  getOrCreatePreferences,
  normalizeCoverageThreshold,
  prefsToData,
} from "@/lib/notificationService";
import { upsertTenderMatchRank } from "@/lib/tenderFeedCache";

export async function notifyUsersAfterSync(createdTenderIds: string[]): Promise<{ notified: number }> {
  if (createdTenderIds.length === 0) return { notified: 0 };

  const tenders = await prisma.tender.findMany({
    where: { id: { in: createdTenderIds }, status: "active" },
  });
  if (tenders.length === 0) return { notified: 0 };

  const users = await getUsersWithAccess();
  let notified = 0;

  for (const user of users) {
    if (!user.company) continue;

    const documents = await loadDocumentsForMatching(user.company.id);
    const docsForMatching = mapCompanyDocuments(documents);
    const catalogRows = await loadCompanyCatalogProducts(user.company.id);
    const mergedCatalog = mergeCompanyCatalogSources({ catalogRows, docsForMatching });
    const catalogProducts = mergedCatalog.catalogProducts;
    const catalogStructured = mergedCatalog.catalogStructured;
    const focus = buildCompanyFocus({
      description: user.company.description,
      catalogProducts: docsForMatching
        .filter((d) => d.isRelevant && d.products?.length)
        .flatMap((d) => d.products || []),
    });

    const companyProfile = {
      okvedCodes: JSON.parse(user.company.okvedCodes || "[]") as string[],
      revenue: user.company.revenue,
      region: user.company.region,
      description: user.company.description,
    };

    const docsWithCatalog = docsForMatching;

    const prefs = await getOrCreatePreferences(user.id);
    const coverageThreshold = normalizeCoverageThreshold(prefs.matchThreshold);

    for (const tender of tenders) {
      const rank = rankTenderForFeed(
        tender,
        focus,
        catalogProducts,
        docsWithCatalog,
        companyProfile,
        { light: true }
      );

      const keywordOnly =
        prefs.notifyTitleKeywords && prefs.titleKeywords.trim().length > 0;
      const profileCandidate = rank.showInFeed && rank.feedScore >= 40;
      if (!profileCandidate && !keywordOnly) continue;

      const needsFullRank =
        profileCandidate &&
        (prefs.notifyHighMatch || rank.feedScore >= coverageThreshold - 10);
      const confirmedRank = needsFullRank
        ? rankTenderForFeed(tender, focus, catalogProducts, docsWithCatalog, companyProfile, {
            light: false,
          })
        : rank;

      if (!profileCandidate && !keywordOnly) continue;
      if (profileCandidate && (!confirmedRank.showInFeed || confirmedRank.feedScore < 40)) continue;

      const n = await notifyTenderAfterSync({
        userId: user.id,
        tenderId: tender.id,
        title: tender.title,
        customerName: tender.customerName,
        price: tender.price,
        deadline: tender.deadline,
        feedScore: confirmedRank.feedScore,
        forecastChance: confirmedRank.forecastChance,
        showInFeed: confirmedRank.showInFeed,
        prefs: prefsToData(prefs),
      });

      if (n) {
        notified++;
        if (profileCandidate) {
          await upsertTenderMatchRank(prisma, user.company.id, tender.id, confirmedRank);
          await prisma.tenderMatch.update({
            where: {
              companyId_tenderId: { companyId: user.company.id, tenderId: tender.id },
            },
            data: {
              gaps: "[]",
              strengths: JSON.stringify([confirmedRank.relevanceReason]),
              recommendation: confirmedRank.hideReason
                ? `Скрыт: ${confirmedRank.hideReason}`
                : "Подходит по профилю",
              status: "new",
            },
          });
        }
      }
    }
  }

  return { notified };
}

export async function scanDeadlineNotifications(): Promise<{ notified: number }> {
  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const tenders = await prisma.tender.findMany({
    where: {
      status: "active",
      deadline: { gte: now, lte: in3days },
    },
  });

  const users = await getUsersWithAccess();
  let notified = 0;

  for (const user of users) {
    if (!user.company) continue;

    const documents = await loadDocumentsForMatching(user.company.id);
    const docsForMatching = mapCompanyDocuments(documents);
    const catalogRows = await loadCompanyCatalogProducts(user.company.id);
    const catalogProducts = mergeCompanyCatalogSources({ catalogRows, docsForMatching }).catalogProducts;
    const focus = buildCompanyFocus({
      description: user.company.description,
      catalogProducts: docsForMatching
        .filter((d) => d.isRelevant && d.products?.length)
        .flatMap((d) => d.products || []),
    });

    const companyProfile = {
      okvedCodes: JSON.parse(user.company.okvedCodes || "[]") as string[],
      revenue: user.company.revenue,
      region: user.company.region,
      description: user.company.description,
    };

    for (const tender of tenders) {
      const rank = rankTenderForFeed(tender, focus, catalogProducts, docsForMatching, companyProfile, {
        light: true,
      });
      if (!rank.showInFeed) continue;

      const daysLeft = Math.max(1, Math.ceil((tender.deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const n = await notifyDeadline({
        userId: user.id,
        tenderId: tender.id,
        title: tender.title,
        daysLeft,
      });
      if (n) notified++;
    }
  }

  return { notified };
}

export async function scanDocumentExpiryNotifications(): Promise<{ notified: number }> {
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const documents = await prisma.document.findMany({
    where: {
      expiresAt: { gte: now, lte: in30days },
    },
    include: { company: { include: { user: true } } },
  });

  let notified = 0;

  for (const doc of documents) {
    const user = doc.company?.user;
    if (!user) continue;

    const daysLeft = Math.max(1, Math.ceil((doc.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const n = await notifyDocExpiry({
      userId: user.id,
      documentId: doc.id,
      documentName: doc.name,
      daysLeft,
    });
    if (n) notified++;
  }

  return { notified };
}

export async function runNotificationMaintenance(): Promise<{
  deadlines: number;
  docExpiry: number;
  dailyDigests: number;
  weeklyDigests: number;
}> {
  const [deadlines, docExpiry, dailyDigests, weeklyDigests] = await Promise.all([
    scanDeadlineNotifications(),
    scanDocumentExpiryNotifications(),
    sendPendingDigestEmails("daily"),
    sendPendingDigestEmails("weekly"),
  ]);

  return {
    deadlines: deadlines.notified,
    docExpiry: docExpiry.notified,
    dailyDigests,
    weeklyDigests,
  };
}

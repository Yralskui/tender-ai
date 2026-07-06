import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import { sendEmail, formatPriceRub } from "@/lib/email";
import { parseKeywordList } from "@/lib/tenderFeedFilters";
import {
  DEFAULT_NOTIFICATION_PREFS,
  prefsToData,
  titleMatchesNotificationKeywords,
  normalizeCoverageThreshold,
  type NotificationType,
  type DigestFrequency,
  type NotificationPreferenceData,
} from "@/lib/notificationPreferences";

export type {
  NotificationType,
  DigestFrequency,
  CoverageThreshold,
  NotificationPreferenceData,
} from "@/lib/notificationPreferences";
export {
  COVERAGE_THRESHOLD_OPTIONS,
  normalizeCoverageThreshold,
  titleMatchesNotificationKeywords,
  prefsToData,
} from "@/lib/notificationPreferences";

const DEFAULT_PREFS = DEFAULT_NOTIFICATION_PREFS;

export async function getOrCreatePreferences(userId: string) {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.notificationPreference.create({
    data: { userId, ...DEFAULT_PREFS },
  });
}

export async function getUsersWithAccess() {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      OR: [{ trialEndsAt: { gt: now } }, { isPaid: true, paidUntil: { gt: now } }],
    },
    include: { company: true },
  });
  return users.filter((u) => getAccessStatus(u).hasAccess);
}

function appBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function notificationIcon(type: NotificationType): string {
  switch (type) {
    case "coverage_high":
    case "match_high":
      return "✅";
    case "title_keyword":
      return "🔍";
    case "deadline":
      return "⏰";
    case "doc_expiry":
      return "⚠️";
    default:
      return "🔔";
  }
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  tenderId?: string;
  documentId?: string;
  score?: number;
}

function isTypeEnabled(type: NotificationType, prefs: NotificationPreferenceData): boolean {
  switch (type) {
    case "profile_match":
    case "new_tender":
      return prefs.notifyNewTenders;
    case "coverage_high":
    case "match_high":
      return prefs.notifyHighMatch;
    case "title_keyword":
      return prefs.notifyTitleKeywords;
    case "deadline":
      return prefs.notifyDeadline;
    case "doc_expiry":
      return prefs.notifyDocExpiry;
    default:
      return false;
  }
}

async function hasRecentNotification(
  userId: string,
  type: NotificationType,
  opts: { tenderId?: string; documentId?: string; withinHours?: number }
): Promise<boolean> {
  const since = new Date(Date.now() - (opts.withinHours ?? 24) * 60 * 60 * 1000);
  const types: NotificationType[] =
    type === "profile_match"
      ? ["profile_match", "new_tender"]
      : type === "coverage_high"
        ? ["coverage_high", "match_high"]
        : [type];

  const found = await prisma.notification.findFirst({
    where: {
      userId,
      type: { in: types },
      createdAt: { gte: since },
      ...(opts.tenderId ? { tenderId: opts.tenderId } : {}),
      ...(opts.documentId ? { documentId: opts.documentId } : {}),
    },
  });
  return Boolean(found);
}

export async function createNotification(input: CreateNotificationInput) {
  const prefs = await getOrCreatePreferences(input.userId);
  if (!isTypeEnabled(input.type, prefsToData(prefs))) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      tenderId: input.tenderId,
      documentId: input.documentId,
      score: input.score,
    },
  });

  if (prefs.emailEnabled && prefs.digestFrequency === "instant") {
    await sendNotificationEmail(notification.id);
  }

  return notification;
}

export async function sendNotificationEmail(notificationId: string): Promise<boolean> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: true },
  });
  if (!notification || notification.emailSentAt) return false;

  const prefs = await getOrCreatePreferences(notification.userId);
  if (!prefs.emailEnabled) return false;

  const icon = notificationIcon(notification.type as NotificationType);
  const tenderLink = notification.tenderId
    ? `${appBaseUrl()}/tenders/${notification.tenderId}`
    : `${appBaseUrl()}/tenders`;

  const text = [
    `${icon} ${notification.title}`,
    "",
    notification.body,
    "",
    notification.tenderId ? `Открыть: ${tenderLink}` : `Лента: ${appBaseUrl()}/tenders`,
    "",
    "— TenderAI",
    "Настройки уведомлений: " + `${appBaseUrl()}/profile`,
  ].join("\n");

  const sent = await sendEmail({
    to: notification.user.email,
    subject: `${icon} ${notification.title}`,
    text,
  });

  if (sent) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { emailSentAt: new Date() },
    });
  } else {
    console.error(
      `[notification] email NOT sent for ${notificationId} → ${notification.user.email} (см. [email] в логе сервера)`
    );
  }

  return sent;
}

/** Повторная отправка писем, которые не ушли (instant-режим). */
export async function resendPendingEmailsForUser(userId: string): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.notification.findMany({
    where: { userId, emailSentAt: null },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    const ok = await sendNotificationEmail(n.id);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Дайджест: письма для уведомлений без emailSentAt за период. */
export async function sendPendingDigestEmails(frequency: DigestFrequency): Promise<number> {
  const users = await getUsersWithAccess();
  let sent = 0;

  for (const user of users) {
    const prefs = await getOrCreatePreferences(user.id);
    if (!prefs.emailEnabled || prefs.digestFrequency !== frequency) continue;

    const pending = await prisma.notification.findMany({
      where: { userId: user.id, emailSentAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (pending.length === 0) continue;

    const lines = pending.map((n) => `• ${n.title}\n  ${n.body.slice(0, 120)}…`);
    const text = [
      `Дайджест TenderAI (${pending.length} уведомлений)`,
      "",
      ...lines,
      "",
      `Открыть ленту: ${appBaseUrl()}/tenders`,
    ].join("\n");

    const ok = await sendEmail({
      to: user.email,
      subject: `TenderAI — ${pending.length} новых уведомлений`,
      text,
    });

    if (ok) {
      await prisma.notification.updateMany({
        where: { id: { in: pending.map((n) => n.id) } },
        data: { emailSentAt: new Date() },
      });
      sent += 1;
    }
  }

  return sent;
}

export async function notifyTenderAfterSync(input: {
  userId: string;
  tenderId: string;
  title: string;
  customerName: string;
  price: number;
  deadline: Date;
  feedScore: number;
  forecastChance: number;
  showInFeed: boolean;
  prefs: NotificationPreferenceData;
}) {
  const daysLeft = Math.ceil((input.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const bodySuffix = `${input.customerName}. Цена: ${formatPriceRub(input.price)}. Дедлайн: ${daysLeft} дн.`;
  const coverageThreshold = normalizeCoverageThreshold(input.prefs.matchThreshold);
  const profileMatch = input.showInFeed && input.feedScore >= 40;
  const keywordHit = titleMatchesNotificationKeywords(input.title, input.prefs.titleKeywords);
  const coverageHit =
    profileMatch && input.prefs.notifyHighMatch && input.forecastChance >= coverageThreshold;

  type TenderNotifyKind = "coverage_high" | "title_keyword" | "profile_match";
  let kind: TenderNotifyKind | null = null;

  if (coverageHit) kind = "coverage_high";
  else if (keywordHit && input.prefs.notifyTitleKeywords) kind = "title_keyword";
  else if (profileMatch && input.prefs.notifyNewTenders) kind = "profile_match";

  if (!kind) return null;
  if (await hasRecentNotification(input.userId, kind, { tenderId: input.tenderId, withinHours: 48 })) {
    return null;
  }

  if (kind === "coverage_high") {
    return createNotification({
      userId: input.userId,
      type: "coverage_high",
      title: `Покрытие ТЗ ${Math.round(input.forecastChance)}%`,
      body: `${input.title}. ${bodySuffix}`,
      tenderId: input.tenderId,
      score: input.forecastChance,
    });
  }

  if (kind === "title_keyword") {
    const words = parseKeywordList(input.prefs.titleKeywords);
    const hit = words.find((w) => input.title.toLowerCase().includes(w)) ?? words[0];
    return createNotification({
      userId: input.userId,
      type: "title_keyword",
      title: `Слово в названии: «${hit}»`,
      body: `${input.title}. ${bodySuffix}`,
      tenderId: input.tenderId,
      score: input.feedScore > 0 ? input.feedScore : undefined,
    });
  }

  return createNotification({
    userId: input.userId,
    type: "profile_match",
    title: "Новый тендер по вашему профилю",
    body: `${input.title}. ${bodySuffix}`,
    tenderId: input.tenderId,
    score: input.feedScore,
  });
}

/** @deprecated use notifyTenderAfterSync */
export async function notifyNewTenderMatch(input: {
  userId: string;
  tenderId: string;
  title: string;
  customerName: string;
  price: number;
  deadline: Date;
  feedScore: number;
  matchThreshold: number;
}) {
  const prefs = await getOrCreatePreferences(input.userId);
  return notifyTenderAfterSync({
    ...input,
    forecastChance: input.feedScore,
    showInFeed: true,
    prefs: { ...prefsToData(prefs), matchThreshold: input.matchThreshold },
  });
}

export async function notifyDeadline(input: {
  userId: string;
  tenderId: string;
  title: string;
  daysLeft: number;
}) {
  if (await hasRecentNotification(input.userId, "deadline", { tenderId: input.tenderId, withinHours: 72 })) {
    return null;
  }

  return createNotification({
    userId: input.userId,
    type: "deadline",
    title: "Истекает дедлайн тендера",
    body: `${input.title} — осталось ${input.daysLeft} дн. Подготовьте заявку.`,
    tenderId: input.tenderId,
  });
}

export async function notifyDocExpiry(input: {
  userId: string;
  documentId: string;
  documentName: string;
  daysLeft: number;
}) {
  if (await hasRecentNotification(input.userId, "doc_expiry", { documentId: input.documentId, withinHours: 168 })) {
    return null;
  }

  return createNotification({
    userId: input.userId,
    type: "doc_expiry",
    title: "Документ скоро истекает",
    body: `${input.documentName} — срок действия истекает через ${input.daysLeft} дн.`,
    documentId: input.documentId,
  });
}

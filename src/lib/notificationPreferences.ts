/**
 * Типы и чистые функции настроек уведомлений — безопасны для client components.
 */

import { matchesFeedKeywords, parseKeywordList, DEFAULT_FEED_FILTERS } from "@/lib/tenderFeedFilters";

export type NotificationType =
  | "profile_match"
  | "coverage_high"
  | "title_keyword"
  | "deadline"
  | "doc_expiry"
  /** @deprecated legacy */
  | "new_tender"
  /** @deprecated legacy */
  | "match_high";

export type DigestFrequency = "instant" | "daily" | "weekly";

export const COVERAGE_THRESHOLD_OPTIONS = [50, 60, 70, 80, 90] as const;
export type CoverageThreshold = (typeof COVERAGE_THRESHOLD_OPTIONS)[number];

export interface NotificationPreferenceData {
  emailEnabled: boolean;
  notifyNewTenders: boolean;
  notifyHighMatch: boolean;
  notifyDeadline: boolean;
  notifyDocExpiry: boolean;
  matchThreshold: number;
  notifyTitleKeywords: boolean;
  titleKeywords: string;
  digestFrequency: DigestFrequency;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferenceData = {
  emailEnabled: true,
  notifyNewTenders: true,
  notifyHighMatch: true,
  notifyDeadline: true,
  notifyDocExpiry: true,
  matchThreshold: 70,
  notifyTitleKeywords: false,
  titleKeywords: "",
  digestFrequency: "instant",
};

export function normalizeCoverageThreshold(value: number | null | undefined): CoverageThreshold {
  const n = value ?? 70;
  if (COVERAGE_THRESHOLD_OPTIONS.includes(n as CoverageThreshold)) return n as CoverageThreshold;
  if (n <= 55) return 50;
  if (n <= 65) return 60;
  if (n <= 75) return 70;
  if (n <= 85) return 80;
  return 90;
}

export function titleMatchesNotificationKeywords(title: string, keywordsRaw: string): boolean {
  const includeWords = parseKeywordList(keywordsRaw);
  if (includeWords.length === 0) return false;
  return matchesFeedKeywords(title, { ...DEFAULT_FEED_FILTERS, includeWords });
}

export function prefsToData(prefs: {
  emailEnabled: boolean;
  notifyNewTenders: boolean;
  notifyHighMatch: boolean;
  notifyDeadline: boolean;
  notifyDocExpiry: boolean;
  matchThreshold: number;
  notifyTitleKeywords: boolean;
  titleKeywords: string;
  digestFrequency: string;
}): NotificationPreferenceData {
  return {
    emailEnabled: prefs.emailEnabled,
    notifyNewTenders: prefs.notifyNewTenders,
    notifyHighMatch: prefs.notifyHighMatch,
    notifyDeadline: prefs.notifyDeadline,
    notifyDocExpiry: prefs.notifyDocExpiry,
    matchThreshold: normalizeCoverageThreshold(prefs.matchThreshold),
    notifyTitleKeywords: prefs.notifyTitleKeywords,
    titleKeywords: prefs.titleKeywords,
    digestFrequency: prefs.digestFrequency as DigestFrequency,
  };
}

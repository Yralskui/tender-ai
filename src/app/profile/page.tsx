import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import Sidebar from "@/components/Sidebar";
import ProfileClient from "./ProfileClient";
import { getOrCreatePreferences, normalizeCoverageThreshold, formatRelativeTime } from "@/lib/notificationService";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const notificationPrefs = await getOrCreatePreferences(user.id);
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const notificationHistory = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    score: n.score,
    tenderId: n.tenderId,
    read: Boolean(n.readAt),
    time: formatRelativeTime(n.createdAt),
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <ProfileClient
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerifiedAt != null,
          company: user.company ? {
            id: user.company.id,
            name: user.company.name,
            inn: user.company.inn,
            ogrn: user.company.ogrn,
            region: user.company.region,
            revenue: user.company.revenue,
            description: user.company.description,
            okvedCodes: user.company.okvedCodes,
          } : null,
        }}
        notificationPrefs={{
          notifyNewTenders: notificationPrefs.notifyNewTenders,
          notifyHighMatch: notificationPrefs.notifyHighMatch,
          notifyDeadline: notificationPrefs.notifyDeadline,
          notifyDocExpiry: notificationPrefs.notifyDocExpiry,
          matchThreshold: normalizeCoverageThreshold(notificationPrefs.matchThreshold),
          notifyTitleKeywords: notificationPrefs.notifyTitleKeywords,
          titleKeywords: notificationPrefs.titleKeywords,
        }}
        notificationHistory={notificationHistory}
      />
    </div>
  );
}

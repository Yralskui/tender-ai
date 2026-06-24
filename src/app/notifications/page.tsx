import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import Sidebar from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";
import { getOrCreatePreferences, formatRelativeTime } from "@/lib/notificationService";
import NotificationControls from "@/components/notifications/NotificationControls";
import NotificationHistory from "@/components/notifications/NotificationHistory";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const prefs = await getOrCreatePreferences(user.id);
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unread = notifications.filter((n) => !n.readAt).length;
  const pendingEmailCount = notifications.filter((n) => !n.emailSentAt).length;

  const historyItems = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    score: n.score,
    tenderId: n.tenderId,
    read: Boolean(n.readAt),
    time: formatRelativeTime(n.createdAt),
  }));

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="flex-1 p-8 max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              Уведомления
              {unread > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold text-slate-900"
                  style={{ background: "#ef4444" }}
                >
                  {unread}
                </span>
              )}
            </h1>
            <p className="text-slate-600">Новые тендеры, дедлайны и напоминания по документам — на email</p>
          </div>
        </div>

        <NotificationControls
          pendingEmailCount={pendingEmailCount}
          initialPrefs={{
            email: user.email,
            emailEnabled: prefs.emailEnabled,
            notifyNewTenders: prefs.notifyNewTenders,
            notifyHighMatch: prefs.notifyHighMatch,
            notifyDeadline: prefs.notifyDeadline,
            notifyDocExpiry: prefs.notifyDocExpiry,
            matchThreshold: prefs.matchThreshold,
            digestFrequency: prefs.digestFrequency as "instant" | "daily" | "weekly",
          }}
        />

        <NotificationHistory items={historyItems} />
      </main>
    </div>
  );
}

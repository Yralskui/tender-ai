import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/notificationService";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      score: n.score,
      tenderId: n.tenderId,
      read: Boolean(n.readAt),
      time: formatRelativeTime(n.createdAt),
      emailSent: Boolean(n.emailSentAt),
    })),
    unread: items.filter((n) => !n.readAt).length,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, read } = body as { id?: string; read?: boolean };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: read === false ? null : new Date() },
  });

  return NextResponse.json({ success: true });
}

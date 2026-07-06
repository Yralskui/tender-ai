import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreatePreferences, normalizeCoverageThreshold } from "@/lib/notificationService";
import { prisma } from "@/lib/prisma";
import type { DigestFrequency } from "@/lib/notificationService";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await getOrCreatePreferences(user.id);
  return NextResponse.json({
    email: user.email,
    emailEnabled: prefs.emailEnabled,
    notifyNewTenders: prefs.notifyNewTenders,
    notifyHighMatch: prefs.notifyHighMatch,
    notifyDeadline: prefs.notifyDeadline,
    notifyDocExpiry: prefs.notifyDocExpiry,
    matchThreshold: normalizeCoverageThreshold(prefs.matchThreshold),
    notifyTitleKeywords: prefs.notifyTitleKeywords,
    titleKeywords: prefs.titleKeywords,
    digestFrequency: prefs.digestFrequency as DigestFrequency,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = [
    "emailEnabled",
    "notifyNewTenders",
    "notifyHighMatch",
    "notifyDeadline",
    "notifyDocExpiry",
    "matchThreshold",
    "notifyTitleKeywords",
    "titleKeywords",
    "digestFrequency",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  if (data.matchThreshold !== undefined) {
    data.matchThreshold = normalizeCoverageThreshold(data.matchThreshold as number);
  }

  if (typeof data.titleKeywords === "string") {
    data.titleKeywords = data.titleKeywords.trim().slice(0, 500);
  }

  if (data.digestFrequency && !["instant", "daily", "weekly"].includes(data.digestFrequency as string)) {
    return NextResponse.json({ error: "invalid digestFrequency" }, { status: 400 });
  }

  await getOrCreatePreferences(user.id);
  const prefs = await prisma.notificationPreference.update({
    where: { userId: user.id },
    data,
  });

  return NextResponse.json({ success: true, preferences: prefs });
}

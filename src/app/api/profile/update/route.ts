import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { companyName, inn, ogrn, region, revenue, description, okvedCodes, userName } = await req.json();

    await prisma.user.update({
      where: { id: session.userId },
      data: { name: userName || undefined },
    });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { company: true },
    });

    if (user?.company) {
      await prisma.company.update({
        where: { id: user.company.id },
        data: {
          name: companyName,
          inn,
          ogrn: ogrn || null,
          region: region || null,
          revenue: revenue ? parseFloat(revenue) : null,
          description: description || null,
          okvedCodes: JSON.stringify(okvedCodes || []),
        },
      });
      scheduleCompanyFeedCacheRebuild(user.company.id, { full: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}

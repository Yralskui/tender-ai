import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { company: true },
    });
    if (!user?.company) {
      return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc || doc.companyId !== user.company.id) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    return NextResponse.json({
      document: {
        ...doc,
        expiresAt: doc.expiresAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get document error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc || doc.companyId !== user.company.id) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    await prisma.document.delete({ where: { id } });
    scheduleCompanyFeedCacheRebuild(user.company.id, { full: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}

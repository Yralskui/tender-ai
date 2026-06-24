import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Не найден" }, { status: 404 });

    let extracted: Record<string, unknown> = {};
    try { extracted = JSON.parse(doc.extractedData || "{}"); } catch {}

    return NextResponse.json({
      status: doc.status,
      aiEnabled: extracted.ai === true,
      analysis: extracted,
    });
  } catch {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

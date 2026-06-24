import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidInn, normalizeInn } from "@/lib/authCookie";
import { scheduleCompanyFeedCacheRebuild } from "@/lib/tenderFeedCache";
import { normalizeCompanyRegion } from "@/lib/regions";

function parseRevenue(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const body = await req.json();
    const {
      companyName,
      inn: rawInn,
      ogrn,
      region,
      revenue,
      description,
      okvedCodes,
      userName,
    } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: "Компания не найдена" }, { status: 400 });
    }

    if (userName !== undefined && userName !== null) {
      await prisma.user.update({
        where: { id: session.userId },
        data: { name: String(userName).trim() || null },
      });
    }

    const companyData: {
      name?: string;
      inn?: string;
      ogrn?: string | null;
      region?: string | null;
      revenue?: number | null;
      description?: string | null;
      okvedCodes?: string;
    } = {};

    if (companyName !== undefined && String(companyName).trim()) {
      companyData.name = String(companyName).trim();
    }

    if (rawInn !== undefined && String(rawInn).trim()) {
      const inn = normalizeInn(String(rawInn));
      if (!isValidInn(inn)) {
        return NextResponse.json({ error: "ИНН должен содержать 10 или 12 цифр" }, { status: 400 });
      }
      if (inn !== user.company.inn) {
        const taken = await prisma.company.findUnique({ where: { inn } });
        if (taken && taken.id !== user.company.id) {
          return NextResponse.json({ error: "Компания с таким ИНН уже зарегистрирована" }, { status: 400 });
        }
      }
      companyData.inn = inn;
    }

    if (ogrn !== undefined) {
      companyData.ogrn = String(ogrn).trim() || null;
    }

    if (region !== undefined) {
      companyData.region = normalizeCompanyRegion(region);
    }

    if (revenue !== undefined) {
      companyData.revenue = parseRevenue(revenue);
    }

    if (description !== undefined) {
      companyData.description = String(description).trim() || null;
    }

    if (okvedCodes !== undefined) {
      companyData.okvedCodes = JSON.stringify(Array.isArray(okvedCodes) ? okvedCodes : []);
    }

    const updated = await prisma.company.update({
      where: { id: user.company.id },
      data: companyData,
    });

    const profileChanged =
      companyData.description !== undefined ||
      companyData.okvedCodes !== undefined ||
      companyData.region !== undefined;

    if (profileChanged) {
      scheduleCompanyFeedCacheRebuild(user.company.id, { full: true });
    }

    return NextResponse.json({
      success: true,
      company: {
        name: updated.name,
        inn: updated.inn,
        ogrn: updated.ogrn,
        region: updated.region,
        revenue: updated.revenue,
        description: updated.description,
        okvedCodes: updated.okvedCodes,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Ошибка сохранения профиля" }, { status: 500 });
  }
}

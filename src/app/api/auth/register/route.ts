import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { authCookieOptions, isValidInn, normalizeInn } from "@/lib/authCookie";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, companyName, inn: rawInn } = await req.json();
    const inn = normalizeInn(rawInn);

    if (!name || !email || !password || !companyName || !inn) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }
    if (!isValidInn(inn)) {
      return NextResponse.json({ error: "ИНН должен содержать 10 или 12 цифр" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Пароль должен быть не менее 6 символов" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 400 });
    }

    const existingCompany = await prisma.company.findUnique({ where: { inn } });
    if (existingCompany) {
      return NextResponse.json(
        {
          error:
            "Компания с таким ИНН уже зарегистрирована. Войдите в существующий аккаунт или укажите другой ИНН.",
          code: "INN_TAKEN",
        },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        trialEndsAt,
        company: {
          create: {
            name: companyName,
            inn,
          },
        },
      },
    });

    const token = await signToken({ userId: user.id, email: user.email });
    const cookieStore = await cookies();
    cookieStore.set("auth-token", token, authCookieOptions());

    return NextResponse.json({ success: true, redirect: "/onboarding" });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

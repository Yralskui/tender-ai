import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isValidInn, normalizeInn } from "@/lib/authCookie";
import { createAndSendVerificationEmail } from "@/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    const { name, email: rawEmail, password, companyName, inn: rawInn } = await req.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
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

    const existing = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });
    if (existing?.emailVerifiedAt) {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 400 });
    }

    const existingCompany = await prisma.company.findUnique({ where: { inn } });
    if (existingCompany && existingCompany.userId !== existing?.id) {
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

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name,
            password: hashedPassword,
            trialEndsAt,
            company: existing.company
              ? { update: { name: companyName, inn } }
              : { create: { name: companyName, inn } },
          },
        })
      : await prisma.user.create({
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

    const sent = await createAndSendVerificationEmail(user);

    const verifyParams = new URLSearchParams({ email: user.email });
    if (sent.devVerifyUrl) {
      verifyParams.set("devLink", sent.devVerifyUrl);
    }

    return NextResponse.json({
      success: true,
      needsVerification: true,
      email: user.email,
      emailSent: sent.ok && !sent.devVerifyUrl,
      devVerifyUrl: sent.devVerifyUrl,
      redirect: `/auth/verify-email?${verifyParams.toString()}`,
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

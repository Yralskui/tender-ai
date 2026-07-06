import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { authCookieOptions } from "@/lib/authCookie";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, password } = await req.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "Подтвердите email — проверьте почту или запросите письмо снова",
          code: "EMAIL_NOT_VERIFIED",
          email: user.email,
        },
        { status: 403 }
      );
    }

    const token = await signToken({ userId: user.id, email: user.email });
    const cookieStore = await cookies();
    cookieStore.set("auth-token", token, authCookieOptions());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

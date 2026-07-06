import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndSendVerificationEmail } from "@/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalized) {
      return NextResponse.json({ error: "Укажите email" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });

    // Не раскрываем, есть ли аккаунт
    if (!user || user.emailVerifiedAt) {
      return NextResponse.json({
        success: true,
        message: "Если аккаунт существует и не подтверждён, письмо отправлено",
      });
    }

    const sent = await createAndSendVerificationEmail(user);
    if (!sent.ok) {
      return NextResponse.json(
        { error: "Не удалось отправить письмо. Попробуйте позже или напишите в поддержку." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: sent.devVerifyUrl
        ? "SMTP недоступен — используйте ссылку ниже (режим разработки)"
        : "Письмо отправлено — проверьте почту",
      devVerifyUrl: sent.devVerifyUrl,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

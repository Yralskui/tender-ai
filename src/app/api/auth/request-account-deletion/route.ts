import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAndSendAccountDeletionEmail } from "@/lib/accountDeletion";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }

    const sent = await createAndSendAccountDeletionEmail({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    if (!sent.ok) {
      return NextResponse.json(
        { error: "Не удалось отправить письмо. Попробуйте позже или напишите в поддержку." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: sent.devDeleteUrl
        ? "SMTP недоступен — используйте ссылку ниже (режим разработки)"
        : "Письмо отправлено — перейдите по ссылке в письме для окончательного удаления",
      devDeleteUrl: sent.devDeleteUrl,
    });
  } catch (error) {
    console.error("Request account deletion error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

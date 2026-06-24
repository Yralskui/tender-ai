import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendEmailDetailed } from "@/lib/email";
import { resendPendingEmailsForUser } from "@/lib/notificationService";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendEmailDetailed({
    to: user.email,
    subject: "TenderAI — тест почты",
    text: [
      "Тестовое письмо от TenderAI.",
      "",
      "Если вы его видите — уведомления о тендерах будут приходить на этот адрес:",
      user.email,
      "",
      "— TenderAI",
    ].join("\n"),
  });

  return NextResponse.json({
    success: result.ok,
    to: user.email,
    via: result.via,
    error: result.error,
  });
}

/** Повторить отправку накопившихся уведомлений без emailSentAt */
export async function PUT() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sent, failed } = await resendPendingEmailsForUser(user.id);
  return NextResponse.json({ success: true, sent, failed });
}

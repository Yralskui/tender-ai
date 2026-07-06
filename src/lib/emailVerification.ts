import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailDetailed } from "@/lib/email";
import { invalidateUserSessionCache } from "@/lib/auth";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function isEmailVerified(user: { emailVerifiedAt: Date | null | undefined }): boolean {
  return user.emailVerifiedAt != null;
}

function buildVerificationUrl(token: string): string {
  return `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export async function issueEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const emailVerificationExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationToken: token,
      emailVerificationExpiresAt,
    },
  });

  await invalidateUserSessionCache(userId);
  return token;
}

export async function sendVerificationEmail(input: {
  email: string;
  name?: string | null;
  token: string;
}): Promise<{ ok: boolean; error?: string; verifyUrl: string; devLink?: boolean }> {
  const verifyUrl = buildVerificationUrl(input.token);
  const greeting = input.name?.trim() ? `Здравствуйте, ${input.name.trim()}!` : "Здравствуйте!";

  const text = `${greeting}

Подтвердите email для доступа к TenderAI (7 дней пробного периода).

Перейдите по ссылке (действует 24 часа):
${verifyUrl}

Если вы не регистрировались — просто проигнорируйте письмо.

TenderAI`;

  const html = `
<p>${greeting}</p>
<p>Подтвердите email для доступа к <strong>TenderAI</strong> (7 дней пробного периода).</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Подтвердить email</a></p>
<p style="color:#64748b;font-size:13px">Ссылка действует 24 часа. Если кнопка не работает, скопируйте в браузер:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
<p style="color:#94a3b8;font-size:12px">Если вы не регистрировались — проигнорируйте письмо.</p>
`;

  const result = await sendEmailDetailed({
    to: input.email,
    subject: "Подтвердите email — TenderAI",
    text,
    html,
  });

  if (!result.ok) {
    console.error("[email-verify] send failed:", result.error);
  }

  const devLink = result.via === "console" || result.via === "console-fallback";
  if (devLink) {
    console.log("[email-verify] dev link:", verifyUrl);
  }

  return {
    ok: result.ok,
    error: result.error,
    verifyUrl,
    devLink: devLink && process.env.NODE_ENV === "development" ? true : undefined,
  };
}

export async function createAndSendVerificationEmail(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<{ ok: boolean; error?: string; devVerifyUrl?: string }> {
  const token = await issueEmailVerificationToken(user.id);
  const sent = await sendVerificationEmail({ email: user.email, name: user.name, token });
  return {
    ok: sent.ok,
    error: sent.error,
    devVerifyUrl: sent.devLink ? sent.verifyUrl : undefined,
  };
}

export async function verifyEmailByToken(token: string): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string }
> {
  const clean = token.trim();
  if (!clean || clean.length < 20) {
    return { ok: false, error: "Некорректная ссылка подтверждения" };
  }

  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: clean },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      emailVerificationExpiresAt: true,
    },
  });

  if (!user) {
    return { ok: false, error: "Ссылка недействительна или уже использована" };
  }

  if (user.emailVerifiedAt) {
    return { ok: true, userId: user.id, email: user.email };
  }

  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    return { ok: false, error: "Ссылка истекла — запросите новое письмо" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  });

  await invalidateUserSessionCache(user.id);
  return { ok: true, userId: user.id, email: user.email };
}

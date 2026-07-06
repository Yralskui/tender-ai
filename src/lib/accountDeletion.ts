import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailDetailed } from "@/lib/email";
import { invalidateUserSessionCache } from "@/lib/auth";
import { appBaseUrl } from "@/lib/appUrl";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function buildDeletionUrl(token: string): string {
  return `${appBaseUrl()}/api/auth/confirm-account-deletion?token=${encodeURIComponent(token)}`;
}

export async function issueAccountDeletionToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const accountDeletionExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountDeletionToken: token,
      accountDeletionExpiresAt,
    },
  });

  await invalidateUserSessionCache(userId);
  return token;
}

export async function sendAccountDeletionEmail(input: {
  email: string;
  name?: string | null;
  token: string;
}): Promise<{ ok: boolean; error?: string; deleteUrl: string; devLink?: boolean }> {
  const deleteUrl = buildDeletionUrl(input.token);
  const greeting = input.name?.trim() ? `Здравствуйте, ${input.name.trim()}!` : "Здравствуйте!";

  const text = `${greeting}

Вы запросили удаление аккаунта в TenderAI.

Для окончательного удаления перейдите по ссылке (действует 24 часа):
${deleteUrl}

После перехода аккаунт и все связанные данные будут удалены без возможности восстановления.

Если вы не запрашивали удаление — просто проигнорируйте письмо, аккаунт останется активным.

TenderAI`;

  const html = `
<p>${greeting}</p>
<p>Вы запросили <strong>удаление аккаунта</strong> в TenderAI.</p>
<p>Для окончательного удаления нажмите кнопку ниже. Ссылка действует 24 часа.</p>
<p><a href="${deleteUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Удалить аккаунт навсегда</a></p>
<p style="color:#64748b;font-size:13px">После перехода аккаунт и все данные будут удалены без возможности восстановления.</p>
<p style="color:#64748b;font-size:13px">Если кнопка не работает, скопируйте в браузер:<br><a href="${deleteUrl}">${deleteUrl}</a></p>
<p style="color:#94a3b8;font-size:12px">Если вы не запрашивали удаление — проигнорируйте письмо.</p>
`;

  const result = await sendEmailDetailed({
    to: input.email,
    subject: "Подтверждение удаления аккаунта — TenderAI",
    text,
    html,
  });

  if (!result.ok) {
    console.error("[account-deletion] send failed:", result.error);
  }

  const devLink = result.via === "console" || result.via === "console-fallback";
  if (devLink) {
    console.log("[account-deletion] dev link:", deleteUrl);
  }

  return {
    ok: result.ok,
    error: result.error,
    deleteUrl,
    devLink: devLink && process.env.NODE_ENV === "development" ? true : undefined,
  };
}

export async function createAndSendAccountDeletionEmail(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<{ ok: boolean; error?: string; devDeleteUrl?: string }> {
  const token = await issueAccountDeletionToken(user.id);
  const sent = await sendAccountDeletionEmail({ email: user.email, name: user.name, token });
  return {
    ok: sent.ok,
    error: sent.error,
    devDeleteUrl: sent.devLink ? sent.deleteUrl : undefined,
  };
}

export async function deleteUserAndData(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: { select: { id: true } } },
  });
  if (!user) return;

  await prisma.$transaction(async (tx) => {
    const companyId = user.company?.id;
    if (companyId) {
      await tx.tenderMatch.deleteMany({ where: { companyId } });
      await tx.document.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    }
    await tx.user.delete({ where: { id: userId } });
  });

  await invalidateUserSessionCache(userId);
}

export async function confirmAccountDeletionByToken(token: string): Promise<
  | { ok: true; email: string }
  | { ok: false; error: string; expired?: boolean }
> {
  const clean = token.trim();
  if (!clean || clean.length < 20) {
    return { ok: false, error: "Некорректная ссылка" };
  }

  const user = await prisma.user.findFirst({
    where: { accountDeletionToken: clean },
    select: {
      id: true,
      email: true,
      accountDeletionExpiresAt: true,
    },
  });

  if (!user) {
    return { ok: false, error: "Ссылка недействительна или уже использована" };
  }

  if (!user.accountDeletionExpiresAt || user.accountDeletionExpiresAt < new Date()) {
    return { ok: false, error: "Ссылка истекла — запросите удаление снова в профиле", expired: true };
  }

  const email = user.email;
  await deleteUserAndData(user.id);
  return { ok: true, email };
}

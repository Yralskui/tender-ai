import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  ok: boolean;
  error?: string;
  via?: string;
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function resolveSmtpCandidates(): Array<{ host: string; port: number; label: string }> {
  const user = process.env.SMTP_USER || "";
  const domain = user.split("@")[1]?.toLowerCase() || "";
  const configuredHost = process.env.SMTP_HOST || "smtp.mail.ru";
  const configuredPort = parseInt(process.env.SMTP_PORT || "465", 10);

  // Явный SMTP_HOST в .env — не перебираем 4 хоста на каждое письмо
  if (process.env.SMTP_HOST?.trim()) {
    const list: Array<{ host: string; port: number; label: string }> = [
      { host: configuredHost, port: configuredPort, label: "env" },
    ];
    if (domain === "bk.ru" && configuredHost !== "smtp.bk.ru") {
      list.push({ host: "smtp.bk.ru", port: configuredPort, label: "bk-mirror" });
    }
    return list;
  }

  const list: Array<{ host: string; port: number; label: string }> = [
    { host: configuredHost, port: configuredPort, label: "env" },
  ];

  if (domain === "bk.ru" || domain === "inbox.ru" || domain === "list.ru") {
    list.push({ host: "smtp.bk.ru", port: 465, label: "bk-465" });
    list.push({ host: "smtp.bk.ru", port: 587, label: "bk-587" });
  }

  list.push({ host: "smtp.mail.ru", port: 465, label: "mail-465" });
  list.push({ host: "smtp.mail.ru", port: 587, label: "mail-587" });

  const seen = new Set<string>();
  return list.filter((c) => {
    const key = `${c.host}:${c.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createTransport(host: string, port: number) {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { minVersion: "TLSv1.2" },
  });
}

async function sendViaSmtp(message: EmailMessage, from: string): Promise<EmailSendResult> {
  let lastError = "SMTP не настроен";

  for (const cfg of resolveSmtpCandidates()) {
    try {
      const transport = createTransport(cfg.host, cfg.port);
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html || message.text.replace(/\n/g, "<br>"),
      });
      console.log(`[email] OK via ${cfg.host}:${cfg.port} → ${message.to}`);
      return { ok: true, via: `${cfg.host}:${cfg.port}` };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[email] ${cfg.host}:${cfg.port} failed:`, lastError);
    }
  }

  return { ok: false, error: lastError };
}

/** HTTPS-отправка через Resend — обходит блокировку SMTP провайдером/прокси (порт 443). */
async function sendViaResend(message: EmailMessage, from: string): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY не задан" };

  const fromAddress = process.env.RESEND_FROM || from.replace(/^.*<([^>]+)>.*$/, "$1").trim() || from;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html || message.text.replace(/\n/g, "<br>"),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }

    console.log(`[email] OK via Resend → ${message.to}`);
    return { ok: true, via: "resend" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Отправка письма. Без SMTP — лог в консоль. При ошибке SMTP пробует Resend. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const result = await sendEmailDetailed(message);
  return result.ok;
}

export async function sendEmailDetailed(message: EmailMessage): Promise<EmailSendResult> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "TenderAI <noreply@tenderai.local>";

  if (!smtpConfigured()) {
    console.log("[email:dev]", { to: message.to, subject: message.subject, text: message.text.slice(0, 200) });
    return { ok: true, via: "console" };
  }

  const smtpResult = await sendViaSmtp(message, from);
  if (smtpResult.ok) return smtpResult;

  const resendResult = await sendViaResend(message, from);
  if (resendResult.ok) return resendResult;

  const error = smtpResult.error || resendResult.error || "unknown";

  const devFallback =
    process.env.NODE_ENV !== "production" || process.env.EMAIL_CONSOLE_FALLBACK === "1";

  // В dev / worker без production — не блокируем поток, письмо в консоль
  if (devFallback) {
    const appPwdHint = /parol prilozheniya|application password/i.test(error)
      ? " (нужен пароль приложения Mail.ru: https://help.mail.ru/mail/security/protection/external )"
      : "";
    console.warn("[email:dev-fallback] SMTP/Resend failed:", error + appPwdHint);
    console.log("[email:dev-fallback]", { to: message.to, subject: message.subject });
    console.log(message.text);
    return { ok: true, via: "console-fallback", error };
  }

  console.error("[email] send failed:", error, "→", message.to);
  return { ok: false, error };
}

export function formatPriceRub(price: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Тест SMTP: node scripts/test-email.mjs [получатель]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[1].trim() === m[0] ? "" : m[2].trim();
    val = val.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || "465", 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || user;
const to = process.argv[2] || user;

if (!host || !user || !pass) {
  console.error("SMTP_HOST, SMTP_USER, SMTP_PASS обязательны в .env");
  process.exit(1);
}

const candidates = [
  { host, port, label: "из .env" },
  { host: "smtp.bk.ru", port: 465, label: "smtp.bk.ru:465" },
  { host: "smtp.mail.ru", port: 587, label: "smtp.mail.ru:587 STARTTLS" },
  { host: "smtp.bk.ru", port: 587, label: "smtp.bk.ru:587 STARTTLS" },
].filter(
  (c, i, arr) => arr.findIndex((x) => x.host === c.host && x.port === c.port) === i
);

let lastError = "";

for (const cfg of candidates) {
  console.log(`\nПробую ${cfg.label} (${cfg.host}:${cfg.port})...`);
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user, pass },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
    tls: { minVersion: "TLSv1.2" },
  });

  try {
    await transport.verify();
    console.log("✓ Подключение OK");

    const info = await transport.sendMail({
      from,
      to,
      subject: "TenderAI — тест почты",
      text: `Почта работает через ${cfg.host}:${cfg.port}\n\n— TenderAI`,
    });

    console.log("✓ Письмо отправлено:", info.messageId);
    console.log(`\nРекомендуемые настройки .env:\nSMTP_HOST=${cfg.host}\nSMTP_PORT=${cfg.port}`);
    process.exit(0);
  } catch (err) {
    lastError = err.message;
    console.error("✗", err.message);
  }
}

console.error("\nВсе варианты не сработали. Последняя ошибка:", lastError);
process.exit(1);

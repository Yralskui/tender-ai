import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Проверка секрета для cron-эндпоинтов (Bearer или заголовок x-cron-secret). */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  if (safeEqual(auth, `Bearer ${secret}`)) return true;

  return safeEqual(req.headers.get("x-cron-secret") || "", secret);
}

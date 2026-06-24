import { NextRequest } from "next/server";

/** Проверка секрета для cron-эндпоинтов (Bearer или заголовок x-cron-secret). */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  return req.headers.get("x-cron-secret") === secret;
}

import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/** Настройки auth-cookie: работает и по http://192.168.x.x в dev, и по https в prod */
export function authCookieOptions(): Partial<ResponseCookie> {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false");

  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function normalizeInn(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

export function isValidInn(inn: string): boolean {
  return inn.length === 10 || inn.length === 12;
}

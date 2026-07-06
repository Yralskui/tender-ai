import type { NextRequest } from "next/server";

const FALLBACK = "http://localhost:3000";

/** Нормализует origin: 0.0.0.0 → localhost (браузер не открывает 0.0.0.0). */
export function normalizeAppOrigin(raw?: string | null): string {
  const value = (raw || FALLBACK).trim();
  if (!value) return FALLBACK;

  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    if (url.hostname === "0.0.0.0") url.hostname = "localhost";
    return url.origin;
  } catch {
    return FALLBACK;
  }
}

export function appBaseUrl(): string {
  return normalizeAppOrigin(
    process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL
  );
}

/** Origin для redirect после API-действий (ссылки из писем, confirm и т.д.). */
export function appRedirectOrigin(req?: NextRequest): string {
  const configured = process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return normalizeAppOrigin(configured);

  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")).replace(/:$/, "");
    if (host) {
      const [hostname, port] = host.split(":");
      const safeHost = hostname === "0.0.0.0" ? "localhost" : hostname;
      const origin = port ? `${proto}://${safeHost}:${port}` : `${proto}://${safeHost}`;
      return normalizeAppOrigin(origin);
    }
    return normalizeAppOrigin(req.nextUrl.origin);
  }

  return appBaseUrl();
}

export function appRedirectUrl(path: string, req?: NextRequest): URL {
  const base = appRedirectOrigin(req);
  return new URL(path.startsWith("/") ? path : `/${path}`, base);
}

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth-edge";

const PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/verify-email",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/session",
  "/api/auth/verification-status",
  "/api/cron/sync",
  "/api/cron/notifications",
];
const PAYWALL_EXEMPT = ["/paywall", "/api/auth/logout", "/api/payment/activate", "/uploads"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PAYWALL_EXEMPT.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth-token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const response = NextResponse.redirect(new URL("/auth/login", req.url));
    response.cookies.delete("auth-token");
    return response;
  }

  // Проверка триала через cookie-флаг (детальная проверка на сервере)
  const trialExpired = req.cookies.get("trial-expired")?.value;
  if (trialExpired === "true" && pathname !== "/paywall") {
    return NextResponse.redirect(new URL("/paywall", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // /api/documents/upload — исключён: proxy буферизует body и ломает multipart FormData на больших PDF
    "/((?!_next/static|_next/image|favicon.ico|api/documents/upload).*)",
  ],
};

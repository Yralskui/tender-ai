import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signToken } from "@/lib/auth";
import { authCookieOptions } from "@/lib/authCookie";
import { verifyEmailByToken } from "@/lib/emailVerification";
import { appRedirectUrl } from "@/lib/appUrl";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const failUrl = appRedirectUrl("/auth/verify-email", req);

  if (!token) {
    failUrl.searchParams.set("error", "missing");
    return NextResponse.redirect(failUrl);
  }

  const result = await verifyEmailByToken(token);
  if (!result.ok) {
    failUrl.searchParams.set("error", result.error);
    if (result.error.includes("истекла")) {
      failUrl.searchParams.set("expired", "1");
    }
    return NextResponse.redirect(failUrl);
  }

  const jwt = await signToken({ userId: result.userId, email: result.email });
  const cookieStore = await cookies();
  cookieStore.set("auth-token", jwt, authCookieOptions());

  const successUrl = appRedirectUrl("/auth/verify-email", req);
  successUrl.searchParams.set("verified", "1");
  successUrl.searchParams.set("email", result.email);
  return NextResponse.redirect(successUrl);
}

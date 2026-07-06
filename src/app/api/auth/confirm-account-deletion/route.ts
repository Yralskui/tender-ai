import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { confirmAccountDeletionByToken } from "@/lib/accountDeletion";
import { appRedirectUrl } from "@/lib/appUrl";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const failUrl = appRedirectUrl("/auth/account-deleted", req);

  if (!token) {
    failUrl.searchParams.set("error", "missing");
    return NextResponse.redirect(failUrl);
  }

  const result = await confirmAccountDeletionByToken(token);
  if (!result.ok) {
    failUrl.searchParams.set("error", encodeURIComponent(result.error));
    if (result.expired) {
      failUrl.searchParams.set("expired", "1");
    }
    return NextResponse.redirect(failUrl);
  }

  const cookieStore = await cookies();
  cookieStore.delete("auth-token");
  cookieStore.delete("trial-expired");

  const successUrl = appRedirectUrl("/auth/account-deleted", req);
  successUrl.searchParams.set("deleted", "1");
  return NextResponse.redirect(successUrl);
}

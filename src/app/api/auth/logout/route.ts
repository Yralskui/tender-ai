import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { invalidateUserSessionCache, verifyToken } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (token) {
    const session = await verifyToken(token);
    if (session) await invalidateUserSessionCache(session.userId);
  }
  cookieStore.delete("auth-token");
  return NextResponse.json({ success: true });
}

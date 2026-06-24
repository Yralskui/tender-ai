import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyCronSecret } from "@/lib/cronAuth";

/** Только авторизованный пользователь (для API). */
export async function requireLoggedInUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  return { user };
}

/** Sync / cron: секрет или залогиненный пользователь. */
export async function requireSyncAccess(req: NextRequest) {
  if (verifyCronSecret(req)) return { cron: true as const };
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  return { user };
}

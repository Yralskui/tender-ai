import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** Статус подтверждения email для страницы verify-email (без утечки лишних данных). */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() || "";
  const session = await getCurrentUser();

  if (session?.emailVerifiedAt) {
    return NextResponse.json({
      verified: true,
      loggedIn: true,
      email: session.email,
    });
  }

  if (!email) {
    return NextResponse.json({ verified: false, loggedIn: false });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerifiedAt: true },
  });

  return NextResponse.json({
    verified: user?.emailVerifiedAt != null,
    loggedIn: false,
    email: user ? email : undefined,
  });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOnboardingComplete } from "@/lib/onboardingStatus";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  const docCount = user.company
    ? await prisma.document.count({ where: { companyId: user.company.id } })
    : 0;

  return NextResponse.json({
    authenticated: true,
    email: user.email,
    emailVerified: user.emailVerifiedAt != null,
    name: user.name,
    onboardingComplete: isOnboardingComplete(user, docCount),
  });
}

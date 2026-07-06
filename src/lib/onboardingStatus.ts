import type { Prisma } from "@/generated/prisma/client";

type UserWithCompany = Prisma.UserGetPayload<{ include: { company: true } }>;

export function isProfileOnboardingDone(user: UserWithCompany): boolean {
  return !!(
    user.company?.description &&
    user.company.description.length > 20 &&
    user.company.okvedCodes &&
    user.company.okvedCodes !== "[]"
  );
}

export function isOnboardingComplete(user: UserWithCompany, docCount: number): boolean {
  return isProfileOnboardingDone(user) && docCount >= 2;
}

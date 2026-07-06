import { cookies } from "next/headers";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { signToken, verifyToken } from "./auth-edge";
import { cacheDel, cacheGetJson, cacheSetJson } from "./appCache";

export { signToken, verifyToken };

const USER_CACHE_TTL_SEC = 60;

type UserWithCompany = Prisma.UserGetPayload<{ include: { company: true } }>;

function reviveDate(value: unknown): Date | null | undefined {
  if (value == null) return value as null | undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function reviveUser(user: UserWithCompany): UserWithCompany {
  const createdAt = reviveDate(user.createdAt);
  const updatedAt = reviveDate(user.updatedAt);
  const trialEndsAt = reviveDate(user.trialEndsAt);
  const emailVerifiedAt = reviveDate(user.emailVerifiedAt);
  if (createdAt) user.createdAt = createdAt;
  if (updatedAt) user.updatedAt = updatedAt;
  if (trialEndsAt) user.trialEndsAt = trialEndsAt;
  if (emailVerifiedAt) user.emailVerifiedAt = emailVerifiedAt;
  if (user.paidUntil) {
    const paidUntil = reviveDate(user.paidUntil);
    if (paidUntil) user.paidUntil = paidUntil;
  }
  if (user.company) {
    const cc = reviveDate(user.company.createdAt);
    const cu = reviveDate(user.company.updatedAt);
    if (cc) user.company.createdAt = cc;
    if (cu) user.company.updatedAt = cu;
  }
  return user;
}

export async function invalidateUserSessionCache(userId: string): Promise<void> {
  await cacheDel(`user:${userId}`);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function getCurrentUser(): Promise<UserWithCompany | null> {
  const session = await getSession();
  if (!session) return null;

  const cacheKey = `user:${session.userId}`;
  const cached = await cacheGetJson<UserWithCompany>(cacheKey);
  if (cached) return reviveUser(cached);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: true },
  });

  if (user) await cacheSetJson(cacheKey, user, USER_CACHE_TTL_SEC);
  return user;
}

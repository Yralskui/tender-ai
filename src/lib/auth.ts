import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { signToken, verifyToken } from "./auth-edge";

export { signToken, verifyToken };

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  return await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: true },
  });
}

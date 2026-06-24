import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import OnboardingClient from "./OnboardingClient";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const docCount = user.company
    ? await prisma.document.count({ where: { companyId: user.company.id } })
    : 0;

  const isProfileDone = !!(
    user.company?.description &&
    user.company.description.length > 20 &&
    user.company.okvedCodes &&
    user.company.okvedCodes !== "[]"
  );

  // Если всё готово — на дашборд
  if (isProfileDone && docCount >= 2) {
    redirect("/dashboard");
  }

  return (
    <OnboardingClient
      profileDone={isProfileDone}
      docCount={docCount}
      companyName={user.company?.name || ""}
    />
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import OnboardingClient from "./OnboardingClient";
import { isProfileOnboardingDone, isOnboardingComplete } from "@/lib/onboardingStatus";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const docCount = user.company
    ? await prisma.document.count({ where: { companyId: user.company.id } })
    : 0;

  const isProfileDone = isProfileOnboardingDone(user);

  // Если всё готово — на дашборд
  if (isOnboardingComplete(user, docCount)) {
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

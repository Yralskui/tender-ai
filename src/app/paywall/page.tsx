import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import PaywallClient from "./PaywallClient";

export default async function PaywallPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);

  return (
    <PaywallClient
      userName={user.name || user.email.split("@")[0]}
      isExpired={!access.hasAccess}
      currentPlan={user.isPaid ? (user.plan ?? null) : null}
    />
  );
}

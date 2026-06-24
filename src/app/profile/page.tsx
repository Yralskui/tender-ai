import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import Sidebar from "@/components/Sidebar";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <ProfileClient
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          company: user.company ? {
            id: user.company.id,
            name: user.company.name,
            inn: user.company.inn,
            ogrn: user.company.ogrn,
            region: user.company.region,
            revenue: user.company.revenue,
            description: user.company.description,
            okvedCodes: user.company.okvedCodes,
          } : null,
        }}
      />
    </div>
  );
}

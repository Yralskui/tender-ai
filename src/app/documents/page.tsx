import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import { getDocRecommendations } from "@/lib/docRecommendations";
import Sidebar from "@/components/Sidebar";
import DocumentsClient from "./DocumentsClient";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const documents = user.company
    ? await prisma.document.findMany({
        where: { companyId: user.company.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const serialized = documents.map((d) => ({
    ...d,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    extractedData: d.extractedData ?? null,
  }));

  let okvedCodes: string[] = [];
  try { okvedCodes = JSON.parse(user.company?.okvedCodes || "[]"); } catch {}

  const recommendations = getDocRecommendations(okvedCodes);

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <DocumentsClient
        initialDocuments={serialized}
        recommendations={recommendations}
        hasProfile={!!(user.company?.description && user.company.description.length > 20)}
      />
    </div>
  );
}

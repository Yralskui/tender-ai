import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import {
  computeCatalogHashFromDocuments,
  getCompanyFeedCacheStatus,
  rebuildCompanyFeedCache,
  scheduleCompanyFeedCacheRebuild,
} from "@/lib/tenderFeedCache";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.company) return NextResponse.json({ error: "No company" }, { status: 400 });

  const access = getAccessStatus(user);
  if (!access.hasAccess) return NextResponse.json({ error: "paywall" }, { status: 403 });

  const documents = await prisma.document.findMany({ where: { companyId: user.company.id } });
  const catalogHash = computeCatalogHashFromDocuments(user.company, documents);
  const status = await getCompanyFeedCacheStatus(user.company.id, catalogHash);

  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.company) return NextResponse.json({ error: "No company" }, { status: 400 });

  const access = getAccessStatus(user);
  if (!access.hasAccess) return NextResponse.json({ error: "paywall" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const background = body.background !== false;

  if (background) {
    scheduleCompanyFeedCacheRebuild(user.company.id, { full: true });
    const documents = await prisma.document.findMany({ where: { companyId: user.company.id } });
    const catalogHash = computeCatalogHashFromDocuments(user.company, documents);
    const status = await getCompanyFeedCacheStatus(user.company.id, catalogHash);
    return NextResponse.json({ started: true, ...status });
  }

  const result = await rebuildCompanyFeedCache(user.company.id, { full: true });
  const documents = await prisma.document.findMany({ where: { companyId: user.company.id } });
  const catalogHash = computeCatalogHashFromDocuments(user.company, documents);
  const status = await getCompanyFeedCacheStatus(user.company.id, catalogHash);
  return NextResponse.json({ started: false, processed: result.processed, ...status });
}

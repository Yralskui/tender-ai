import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import { loadTenderFeedPage, type PageFeedMode } from "@/lib/tenderFeedPage";
import { loadDocumentsForMatching } from "@/lib/documentQuery";
import { createPerfTimer } from "@/lib/perfLog";
import { parseFeedFilters } from "@/lib/tenderFeedFilters";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "matched";
  const offset = url.searchParams.get("offset") || "0";
  const perf = createPerfTimer(`API GET /api/tenders/feed?view=${view}&offset=${offset}`);

  const user = await getCurrentUser();
  perf.step("getCurrentUser");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = getAccessStatus(user);
  if (!access.hasAccess) return NextResponse.json({ error: "paywall" }, { status: 403 });

  const feedMode: PageFeedMode =
    view === "tagged"
      ? "tagged"
      : view === "catalog"
        ? "catalog"
        : view === "profile"
          ? "profile"
          : "matched";

  const tagId = url.searchParams.get("tag") || undefined;
  const searchQuery = url.searchParams.get("q") || "";
  const feedFilters = parseFeedFilters({
    sort: url.searchParams.get("sort"),
    deadline: url.searchParams.get("deadline"),
    include: url.searchParams.get("include"),
    exclude: url.searchParams.get("exclude"),
    priceMin: url.searchParams.get("priceMin"),
    priceMax: url.searchParams.get("priceMax"),
  });
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limit = Math.min(60, Math.max(10, parseInt(url.searchParams.get("limit") || "40", 10) || 40));

  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(user.company?.okvedCodes || "[]");
  } catch {
    // ignore
  }

  const documents = user.company ? await loadDocumentsForMatching(user.company.id) : [];
  perf.step("documents", { count: documents.length });

  const page = await loadTenderFeedPage({
    okvedCodes,
    documents,
    company: user.company
      ? {
          id: user.company.id,
          revenue: user.company.revenue,
          region: user.company.region,
          description: user.company.description,
        }
      : null,
    feedMode,
    tagId,
    searchQuery,
    offset: offsetNum,
    limit,
    filters: feedFilters,
  });
  perf.end("ответ", { items: page.items.length, hasMore: page.hasMore });

  return NextResponse.json(page);
}

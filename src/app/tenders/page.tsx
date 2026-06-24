import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessStatus } from "@/lib/subscription";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { mapCompanyDocuments } from "@/lib/matching";
import { focusSummary, buildCompanyFocus } from "@/lib/companyFocus";
import {
  listCompanyTenderLabels,
  listAllTaggedTenderIds,
  countAssignmentsByLabel,
} from "@/lib/tenderLabels";
import { loadTenderFeedPage, type PageFeedMode } from "@/lib/tenderFeedPage";
import { createPerfTimer } from "@/lib/perfLog";
import { parseFeedFilters } from "@/lib/tenderFeedFilters";
import { buildTendersFeedReturnHref } from "@/lib/tenderFeedReturn";
import TendersSyncButton from "@/components/TendersSyncButton";
import { Suspense } from "react";
import TenderFeedSearch from "@/components/tender/TenderFeedSearch";
import TenderFeedFilters from "@/components/tender/TenderFeedFilters";
import TenderLabelsBar from "@/components/tender/TenderLabelsBar";
import TenderFeedInfiniteList from "@/components/tender/TenderFeedInfiniteList";
import { BackgroundTzEnrichment, TenderFeedScrollRestore, FeedCachePoller } from "@/components/tender/TenderFeedNav";
import { AutoSyncIndicator } from "@/components/tender/AutoSyncIndicator";

export default async function TendersPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    tag?: string;
    q?: string;
    sort?: string;
    deadline?: string;
    include?: string;
    exclude?: string;
    priceMin?: string;
    priceMax?: string;
  }>;
}) {
  const {
    view: viewParam,
    tag: tagId,
    q: queryRaw,
    sort,
    deadline,
    include,
    exclude,
    priceMin,
    priceMax,
  } = await searchParams;
  const searchQuery = (queryRaw || "").trim();
  const feedFilters = parseFeedFilters({ sort, deadline, include, exclude, priceMin, priceMax });
  const feedMode: PageFeedMode =
    viewParam === "tagged"
      ? "tagged"
      : viewParam === "catalog"
        ? "catalog"
        : viewParam === "profile"
          ? "profile"
          : "matched";

  const perf = createPerfTimer(`GET /tenders?view=${feedMode}`);

  const user = await getCurrentUser();
  perf.step("getCurrentUser");
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(user.company?.okvedCodes || "[]");
  } catch {}

  const companyId = user.company?.id;

  const documents = user.company
    ? await prisma.document.findMany({ where: { companyId: user.company.id } })
    : [];
  perf.step("documents", { count: documents.length });

  const [tenderLabels, labelCounts, allTaggedIds, feedPage] = await Promise.all([
    companyId ? listCompanyTenderLabels(companyId) : Promise.resolve([]),
    companyId ? countAssignmentsByLabel(companyId) : Promise.resolve(new Map<string, number>()),
    companyId ? listAllTaggedTenderIds(companyId) : Promise.resolve([] as string[]),
    loadTenderFeedPage({
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
      offset: 0,
      filters: feedFilters,
    }),
  ]);
  perf.step("labels + feedPage", {
    items: feedPage.items.length,
    totalInDb: feedPage.totalInDb,
    cacheBuilding: feedPage.cacheBuilding ?? false,
    statsShown: feedPage.statsShown,
  });

  const hasProfile = !!(user.company?.description && user.company.description.length > 20);
  const hasDocs = documents.length >= 2;
  const catalogProducts = mapCompanyDocuments(documents)
    .filter((d) => d.isRelevant && d.products?.length)
    .flatMap((d) => d.products || []);
  const hasCatalog = catalogProducts.length > 0;

  const companyFocus = buildCompanyFocus({
    description: user.company?.description ?? null,
    catalogProducts,
  });
  const focusLabel = focusSummary(companyFocus);
  const totalInDb = feedPage.totalInDb;

  const labelsWithCounts = tenderLabels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    count: labelCounts.get(label.id) || 0,
  }));

  const hintLines: string[] = [];
  if (hasCatalog && feedMode === "matched") {
    const matchedTotal = feedPage.cacheMatchedCount ?? feedPage.statsShown;
    hintLines.push(`Узкая лента по РУ · ${matchedTotal} подходящих из ${totalInDb}`);
  }
  if (feedMode === "catalog") {
    hintLines.push(`Каталог: ${totalInDb} закупок — листайте вниз, подгрузим автоматически`);
  }
  if (totalInDb < 500) {
    hintLines.push(`В базе ${totalInDb} — «+ каталог» подтянет ещё с ЕИС`);
  }
  hintLines.push("Истёкшие без метки скрыты и удаляются при синхронизации; с меткой — в разделе «Метки»");
  hintLines.push("База обновляется автоматически каждые ~20 мин (скачивание с ЕИС + разбор ТЗ)");
  if (!hasProfile) {
    hintLines.push("Заполните профиль — подбор станет точнее");
  }

  const returnView = feedMode === "tagged" ? "tagged" : feedMode;
  const returnHref = buildTendersFeedReturnHref({
    view: returnView,
    tag: tagId,
    q: searchQuery,
    sort,
    deadline,
    include,
    exclude,
    priceMin,
    priceMax,
  });

  perf.end("рендер", { feedMode, search: searchQuery || null });

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="app-main p-3 sm:p-4 lg:p-5">
        <BackgroundTzEnrichment />
        <FeedCachePoller active={Boolean(feedPage.cacheBuilding)} feedMode={feedMode} />
        <TenderFeedScrollRestore returnHref={returnHref} />
        <header className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-900">Тендеры</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5 leading-snug flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  ЕИС: <span className="font-medium text-slate-800">{totalInDb}</span>
                  <span className="mx-1">·</span>
                  {focusLabel}
                  <span className="mx-1">·</span>
                  <span className="text-slate-800 font-medium">
                    показано {feedPage.items.length}
                    {feedPage.hasMore ? "+" : ""}
                  </span>
                </span>
                <AutoSyncIndicator />
                {feedMode === "matched" && (feedPage.statsHiddenNoRu ?? 0) > 0 && (
                  <>
                    <span className="mx-1">·</span>
                    скрыто по РУ (в просканированной части)
                  </>
                )}
              </p>
            </div>
            <TendersSyncButton compact className="shrink-0 w-full sm:w-auto" />
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <Link
              href="/tenders?view=matched"
              className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-full border transition-colors ${
                feedMode === "matched"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-medium"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Можно участвовать
            </Link>
            <Link
              href="/tenders?view=profile"
              className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-full border transition-colors ${
                feedMode === "profile"
                  ? "bg-blue-50 border-blue-300 text-blue-800 font-medium"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              По профилю
            </Link>
            <Link
              href="/tenders?view=catalog"
              className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-full border transition-colors ${
                feedMode === "catalog"
                  ? "bg-violet-50 border-violet-300 text-violet-800 font-medium"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Каталог ({totalInDb})
            </Link>
          </div>

          {user.company && (
            <TenderLabelsBar
              labels={labelsWithCounts}
              feedMode={feedMode}
              activeTagId={tagId}
              taggedTotal={allTaggedIds.length}
            />
          )}

          <Suspense fallback={null}>
            <TenderFeedSearch view={feedMode} />
          </Suspense>
          <Suspense fallback={null}>
            <TenderFeedFilters view={feedMode} />
          </Suspense>
          {searchQuery && (
            <p className="text-xs text-slate-500 mt-2">
              Поиск: «{searchQuery}» — найдено {feedPage.items.length}
            </p>
          )}

          {hintLines.length > 0 && (
            <details className="mt-2 text-[11px] text-slate-500">
              <summary className="cursor-pointer hover:text-slate-700 select-none">Подсказки</summary>
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                {hintLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </header>

        {(!hasProfile || !hasDocs) && (
          <div
            className="rounded-xl border border-yellow-500/20 p-3 mb-4 flex flex-wrap items-center gap-3"
            style={{ background: "rgba(245,158,11,0.05)" }}
          >
            <AlertCircle size={18} className="text-amber-700 shrink-0" />
            <p className="text-xs sm:text-sm text-slate-700 flex-1 min-w-[200px]">
              {!hasProfile ? "Заполните профиль компании" : "Загрузите минимум 2 документа (РУ с приложением)"}
            </p>
            <Link
              href={!hasProfile ? "/onboarding" : "/documents"}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-900 font-medium shrink-0"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
            >
              {!hasProfile ? "Профиль" : "Документы"}
            </Link>
          </div>
        )}

        {feedPage.cacheBuilding ? (
          <div className="text-center py-16 app-card rounded-xl border border-slate-200 px-4 max-w-5xl">
            <p className="text-slate-800 font-medium mb-2 text-sm">Считаем совпадения с вашим РУ…</p>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Первый раз это занимает несколько минут ({totalInDb} закупок). Дальше лента открывается сразу из кэша.
            </p>
            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
              <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-emerald-500 animate-spin" />
              Обновим страницу автоматически
            </div>
          </div>
        ) : feedPage.items.length > 0 ? (
          <TenderFeedInfiniteList
            initialItems={feedPage.items}
            initialOffset={feedPage.nextOffset}
            initialHasMore={feedPage.hasMore}
            totalInDb={totalInDb}
            feedMode={feedMode}
            tagId={tagId}
            searchQuery={searchQuery}
            returnView={returnView}
            returnHref={returnHref}
            sort={sort}
            deadline={deadline}
            include={include}
            exclude={exclude}
            priceMin={priceMin}
            priceMax={priceMax}
          />
        ) : (
          <div className="text-center py-12 app-card rounded-xl border border-slate-200 px-4 max-w-5xl">
            <p className="text-slate-700 font-medium mb-2 text-sm">
              {feedMode === "tagged" || tagId
                ? tagId
                  ? "Нет тендеров с этой меткой"
                  : "Пока нет тендеров с метками"
                : feedMode === "profile"
                  ? "Нет тендеров по профилю"
                  : "Нет тендеров с совпадением в РУ"}
            </p>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              {feedMode === "tagged" || tagId
                ? "Откройте карточку тендера и нажмите метку вверху — закупка появится в этом разделе."
                : totalInDb < 200
                  ? `В базе ${totalInDb} закупок. Нажмите «Подобрать закупки» или «+ каталог».`
                  : feedMode === "profile"
                    ? `В базе ${totalInDb} — уточните профиль или подгрузите с ЕИС.`
                    : `Попробуйте «По профилю» или «Каталог» — в базе ${totalInDb} закупок.`}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <TendersSyncButton compact />
              {!hasCatalog && (
                <Link
                  href="/documents"
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Загрузить РУ
                </Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

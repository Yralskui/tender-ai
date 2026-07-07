import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  Clock,
  ExternalLink,
  ArrowLeft,
  FileText,
  TrendingUp,
  Shield,
} from "lucide-react";
import { analyzeMatch, filterDocsForTenderMatch, mapCompanyDocuments } from "@/lib/matching";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "@/lib/catalogProductSync";
import { buildProcurementBundles, blockProcurementBundleMatches } from "@/lib/tzProcurementBundles";
import { normalizeStoredRequirements, stripEisMarkup } from "@/lib/textNormalize";
import { resolveTzVolumes, summarizeProcurementVolume } from "@/lib/tzVolumes";
import {
  fetchTzVolumesFromEisNotice,
  mergeEisVolumesIntoRequirements,
} from "@/lib/fetchTzVolumesFromEis";
import { resolveTenderEisLink, resolvePlatformTenderLink } from "@/lib/zakupki";
import { analyzeMatchWithGroq, getGroqRateLimitRetryMinutes, isGroqRateLimited, isGroqTenderMatchEnabled } from "@/lib/aiAnalysis";
import TenderAnalysisView from "@/components/tender/TenderAnalysisView";
import TenderDocumentsPanel from "@/components/tender/TenderDocumentsPanel";
import TenderLabelsPanel from "@/components/tender/TenderLabelsPanel";
import TenderQuickActions from "@/components/tender/TenderQuickActions";
import NationalRegimePanel from "@/components/tender/NationalRegimePanel";
import {
  buildCharacteristicMatches,
  extractCharacteristicSpecs,
  summarizeTechnicalAssignment,
  type ProcurementKind,
} from "@/lib/tenderPresentation";
import { computeTenderParticipation } from "@/lib/tenderRanking";
import TenderEconomicsPanel from "@/components/tender/TenderEconomicsPanel";
import { buildTenderEconomics } from "@/lib/tenderEconomics";
import { loadCompanySupplierPriceCatalog } from "@/lib/supplierPriceSync";
import {
  listCompanyTenderLabels,
  listTenderLabelAssignments,
} from "@/lib/tenderLabels";
import { createPerfTimer } from "@/lib/perfLog";
import { resolveTendersBackHref } from "@/lib/tenderFeedReturn";

function formatPrice(p: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(p);
}

function daysUntil(date: Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function TenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; returnTo?: string }>;
}) {
  const { id } = await params;
  const { from: fromView, returnTo } = await searchParams;
  const perf = createPerfTimer(`GET /tenders/${id.slice(0, 8)}…`);
  const backHref = resolveTendersBackHref(returnTo, fromView);
  const user = await getCurrentUser();
  perf.step("getCurrentUser");
  if (!user) redirect("/auth/login");

  const access = getAccessStatus(user);
  if (!access.hasAccess) redirect("/paywall");

  const tender = await prisma.tender.findUnique({ where: { id } });
  perf.step("tender.findUnique");
  if (!tender) notFound();

  const displayTitle = stripEisMarkup(tender.title);
  const displayCustomer = stripEisMarkup(tender.customerName);

  const companyId = user.company?.id;
  const [documents, tenderLabels, labelAssignments, catalogRows, supplierPriceCatalog] = await Promise.all([
    companyId
      ? prisma.document.findMany({ where: { companyId } })
      : Promise.resolve([]),
    companyId ? listCompanyTenderLabels(companyId) : Promise.resolve([]),
    companyId ? listTenderLabelAssignments(companyId, id) : Promise.resolve([]),
    companyId ? loadCompanyCatalogProducts(companyId) : Promise.resolve([]),
    companyId ? loadCompanySupplierPriceCatalog(companyId) : Promise.resolve({ pricelists: [], items: [] }),
  ]);
  perf.step("parallel load", {
    documents: documents.length,
    catalogRows: catalogRows.length,
    priceItems: supplierPriceCatalog.items.length,
    pricelists: supplierPriceCatalog.pricelists.length,
  });

  let requirements = normalizeStoredRequirements(JSON.parse(tender.requirements as string));

  if (resolveTzVolumes(requirements).length === 0 && tender.externalId) {
    const noticeType =
      typeof requirements.noticeType === "string" && requirements.noticeType.trim()
        ? requirements.noticeType
        : "ea20";
    const eisVolumes = await fetchTzVolumesFromEisNotice(tender.externalId, noticeType);
    if (eisVolumes?.length) {
      const merged = mergeEisVolumesIntoRequirements(
        requirements as Record<string, unknown>,
        eisVolumes
      );
      requirements = normalizeStoredRequirements(merged as typeof requirements);
      void prisma.tender
        .update({
          where: { id: tender.id },
          data: { requirements: JSON.stringify(merged) },
        })
        .catch(() => {});
    }
  }
  perf.step("requirements + volumes");
  const eisLink = resolveTenderEisLink(tender.externalId, {
    procedureType: requirements.procedureType,
    title: tender.title,
    sourceUrl: tender.sourceUrl,
  });
  const platformLink =
    typeof requirements.platform === "string" && requirements.platform.trim()
      ? resolvePlatformTenderLink(
          requirements.platform,
          typeof requirements.platformUrl === "string" ? requirements.platformUrl : undefined,
          tender.externalId,
          { title: tender.title }
        )
      : null;
  const days = daysUntil(tender.deadline);

  let okvedCodes: string[] = [];
  try { okvedCodes = JSON.parse(user.company?.okvedCodes || "[]"); } catch {}

  const docsForMatching = mapCompanyDocuments(documents);

  const hasAnalysis = docsForMatching.some((d) => d.isRelevant);
  const tenderMeta = { category: tender.category, title: tender.title };

  const companyProfile = {
    okvedCodes,
    revenue: user.company?.revenue ?? null,
    region: user.company?.region ?? null,
    description: user.company?.description ?? null,
  };

  type TenderAnalysis = {
    score: number;
    strengths: string[];
    warnings: string[];
    blockers: string[];
    missingDocs: string[];
    recommendation: string;
    irrelevantDocsCount?: number;
    specMatches?: Array<{ spec: string; status: "match" | "partial" | "missing"; note: string }>;
    catalogProducts?: string[];
    catalogRuSources?: Array<{ number: string; name: string; productCount: number }>;
    excludedRuCount?: number;
    nomenclatureMismatch?: boolean;
  };

  let analysis: TenderAnalysis | null = hasAnalysis
    ? analyzeMatch(
        docsForMatching,
        companyProfile,
        requirements,
        tender.okvedCode ?? null,
        tender.region,
        tenderMeta
      )
    : null;
  perf.step("analyzeMatch (rules)");

  const ruleAnalysis = analysis;

  let usedAI = false;
  let aiSkippedReason: string | null = null;
  const groqRateLimitMinutes = getGroqRateLimitRetryMinutes();

  if (hasAnalysis && process.env.GROQ_API_KEY) {
    if (!isGroqTenderMatchEnabled()) {
      aiSkippedReason = "rules";
    } else if (isGroqRateLimited()) {
      aiSkippedReason = "rate_limit";
    } else {
      try {
        const docsForAi = filterDocsForTenderMatch(docsForMatching, requirements, tenderMeta);
        const aiResult = await analyzeMatchWithGroq(
          tender.title,
          tender.description ?? "",
          requirements,
          docsForAi,
          companyProfile
        );
        if (aiResult && ruleAnalysis) {
          analysis = {
            ...aiResult,
            irrelevantDocsCount: ruleAnalysis.irrelevantDocsCount,
            catalogProducts: ruleAnalysis.catalogProducts,
            catalogRuSources: ruleAnalysis.catalogRuSources,
            excludedRuCount: ruleAnalysis.excludedRuCount,
            nomenclatureMismatch: ruleAnalysis.nomenclatureMismatch,
            specMatches:
              aiResult.specMatches && aiResult.specMatches.length > 0
                ? aiResult.specMatches
                : ruleAnalysis.specMatches,
          };
          usedAI = true;
        } else if (!aiResult && isGroqRateLimited()) {
          aiSkippedReason = "rate_limit";
        }
      } catch {
        aiSkippedReason = "error";
      }
    }
  }
  perf.step("groq AI", { usedAI, aiSkippedReason });

  const mergedCatalog = mergeCompanyCatalogSources({
    catalogRows,
    docsForMatching,
    fallbackProducts: ruleAnalysis?.catalogProducts,
  });
  const catalogProducts = mergedCatalog.catalogProducts;
  const catalogRuSources = ruleAnalysis?.catalogRuSources ?? [];
  const excludedRuCount = ruleAnalysis?.excludedRuCount ?? 0;

  const catalogStructured = mergedCatalog.catalogStructured;

  let procurementBundles = buildProcurementBundles(
    requirements,
    tender.title,
    catalogProducts,
    catalogStructured
  );

  const hasRuUploaded = docsForMatching.some(
    (d) =>
      d.isRelevant &&
      (d.type === "medical_ru" || d.aiDocType === "medical_ru" || d.documentScope === "catalog")
  );

  const participation = computeTenderParticipation(
    {
      title: tender.title,
      category: tender.category,
      okvedCode: tender.okvedCode,
      region: tender.region,
      requirements,
    },
    catalogProducts,
    catalogStructured,
    {
      parsedReqs: requirements as Record<string, unknown>,
      analysisScore: ruleAnalysis?.score,
      analysisBlockers: ruleAnalysis?.blockers,
      analysisNomenclatureMismatch: ruleAnalysis?.nomenclatureMismatch,
      hasCatalog: catalogProducts.length > 0 || hasRuUploaded,
    }
  );

  const forecast = participation.forecast;
  const nomenclatureRows = participation.nomRows;
  const procurementItems = participation.procurementItems;
  const procurementKind: ProcurementKind = participation.procurementKind;

  if (
    participation.nomenclatureMismatch &&
    participation.ruMatched + participation.ruPartial === 0
  ) {
    procurementBundles = blockProcurementBundleMatches(
      procurementBundles,
      "Закупка не по вашей номенклатуре — позиции из РУ не подходят"
    );
  }

  const characteristicRows = buildCharacteristicMatches(
    extractCharacteristicSpecs(requirements),
    catalogProducts,
    catalogStructured
  );
  perf.step("presentation + forecast");

  const tzSummary = summarizeTechnicalAssignment(requirements);

  const tzVolumes = resolveTzVolumes(requirements);
  const procurementVolumeSummary = summarizeProcurementVolume(tzVolumes);
  const economics = buildTenderEconomics(
    tzVolumes,
    tender.title,
    tender.price,
    supplierPriceCatalog.items,
    supplierPriceCatalog.pricelists
  );
  perf.step("economics", { lines: economics.lines.length, multiPricelist: economics.multiPricelist });

  const aiLabel = usedAI
    ? "Groq AI + сверка по РУ"
    : aiSkippedReason === "rate_limit"
      ? `Лимит Groq${groqRateLimitMinutes ? ` (~${groqRateLimitMinutes} мин)` : ""} · прогноз по правилам`
      : "Прогноз по вашим документам и ТЗ из zakupki";

  const sectionNav = [
    { href: "#forecast", label: "Прогноз" },
    { href: "#objects", label: "Объекты закупки" },
    ...(catalogProducts.length > 0 ? [{ href: "#match", label: "Сверка с РУ" }] : []),
    { href: "#economics", label: "Экономика" },
    { href: "#customer", label: "Заказчик и сроки" },
    { href: "#national-regime", label: "Нацрежим" },
    { href: "#docs", label: "Документы" },
  ];

  perf.end("рендер");

  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="flex-1 p-8 max-w-6xl">
        {/* Навигация */}
        <Link href={backHref} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm mb-6 transition-colors">
          <ArrowLeft size={16} />
          Назад к тендерам
        </Link>

        {/* Заголовок тендера */}
        <div className="rounded-2xl border border-slate-200 p-6 mb-6 app-card">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">#{tender.externalId}</span>
                <span className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">{tender.category}</span>
                {requirements.importedFromEis && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-600">
                    Реальная закупка ЕИС
                  </span>
                )}
                {requirements.tzParsedFromFile && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-600">
                    ТЗ из файла zakupki
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${days <= 3 ? "bg-red-500/10 border border-red-500/30 text-red-600" : days <= 7 ? "bg-yellow-500/10 border border-yellow-500/30 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                  <Clock size={10} className="inline mr-1" />
                  {days > 0 ? `${days} дней до дедлайна` : "Дедлайн истёк"}
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">{displayTitle}</h1>
              <p className="text-slate-600 text-sm mb-1">{displayCustomer}</p>
              <p className="text-slate-500 text-sm mb-2">{tender.region}</p>
              {companyId && (
                <TenderLabelsPanel
                  tenderId={tender.id}
                  initialLabels={tenderLabels}
                  initialAssignedIds={labelAssignments.map((a) => a.labelId)}
                />
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold text-slate-900 mb-1">{formatPrice(tender.price)}</div>
              <p className="text-xs text-slate-500">Начальная цена</p>
              <div className="flex flex-col items-end gap-1.5 mt-2">
                <a
                  href={eisLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  title={eisLink.hint}
                >
                  {eisLink.label} <ExternalLink size={10} />
                </a>
                {platformLink && (
                  <a
                    href={platformLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                    title={platformLink.hint}
                  >
                    {platformLink.label} <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="space-y-5 min-w-0">
            {hasAnalysis && analysis ? (
              <TenderAnalysisView
                forecast={forecast}
                procurementItems={procurementItems}
                nomenclatureRows={nomenclatureRows}
                characteristicRows={characteristicRows}
                catalogRuSources={catalogRuSources}
                excludedRuCount={excludedRuCount}
                analysis={{
                  score: analysis.score,
                  recommendation: analysis.recommendation,
                  blockers: analysis.blockers,
                  warnings: analysis.warnings,
                  missingDocs: analysis.missingDocs,
                }}
                hasCatalog={catalogProducts.length > 0}
                catalogProductCount={catalogStructured.length || catalogProducts.length}
                aiLabel={aiLabel}
                procurementKind={procurementKind}
                tenderTitle={tender.title}
                tzEnrichmentPending={requirements.tzEnrichmentPending === true}
                tzParsedFromFile={requirements.tzParsedFromFile === true}
                procurementBundles={procurementBundles}
                tenderId={tender.id}
                procurementVolumeSummary={procurementVolumeSummary}
              />
            ) : (
              <>
                <TenderAnalysisView
                  forecast={forecast}
                  procurementItems={procurementItems}
                  nomenclatureRows={nomenclatureRows}
                  characteristicRows={[]}
                  catalogRuSources={[]}
                  excludedRuCount={0}
                  analysis={null}
                  hasCatalog={false}
                  aiLabel="Загрузите РУ — включится прогноз и сверка номенклатуры"
                  procurementKind={procurementKind}
                  tenderTitle={tender.title}
                  tzEnrichmentPending={requirements.tzEnrichmentPending === true}
                  procurementVolumeSummary={procurementVolumeSummary}
                />
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center app-card">
                  <Shield size={28} className="mx-auto text-slate-500 mb-2" />
                  <p className="text-sm text-slate-600">Загрузите РУ с приложением для персонального прогноза</p>
                </div>
              </>
            )}

            {tzSummary && (
              <section className="rounded-2xl border border-slate-200 p-5 app-card">
                <h3 className="font-semibold text-slate-900 mb-2 text-sm">Суть закупки</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{tzSummary}</p>
              </section>
            )}

            <TenderEconomicsPanel economics={economics} />

            <NationalRegimePanel requirements={requirements} nmck={tender.price} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <TenderQuickActions
              tenderId={tender.id}
              documentCount={requirements.tzDocuments?.length || requirements.tenderDocuments?.length || 0}
              showAnalyze
            />

            <nav className="rounded-2xl border border-slate-200 p-4 app-card hidden lg:block">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">На странице</p>
              <ul className="space-y-1">
                {sectionNav.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="block text-sm text-slate-600 hover:text-blue-600 py-1 transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div id="customer" className="rounded-2xl border border-slate-200 p-5 app-card">
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">Заказчик и сроки</h3>
              <p className="text-sm text-slate-800 font-medium mb-1">{displayCustomer}</p>
              <p className="text-xs text-slate-500 mb-3">{tender.region}</p>
              <div className="space-y-2 text-sm border-t border-slate-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Дедлайн</span>
                  <span className={days <= 3 ? "text-red-600 font-medium" : "text-slate-800"}>
                    {new Date(tender.deadline).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Осталось</span>
                  <span className="font-medium text-slate-800">{days > 0 ? `${days} дн.` : "истёк"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">НМЦК</span>
                  <span className="font-medium text-slate-800">{formatPrice(tender.price)}</span>
                </div>
              </div>
            </div>

            {requirements.platform && platformLink && (
              <div className="rounded-2xl border border-slate-200 p-4 app-card">
                <p className="text-xs text-slate-500 mb-2">Торговая площадка</p>
                <p className="text-sm font-semibold text-slate-900">{requirements.platform}</p>
                <p className="text-xs text-slate-600 mt-0.5">{requirements.procedureType} · {requirements.law}</p>
                <a
                  href={platformLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2"
                >
                  Перейти на площадку <ExternalLink size={10} />
                </a>
              </div>
            )}

            <div id="docs" className="rounded-2xl border border-slate-200 p-5 app-card">
              <h3 className="font-semibold text-slate-900 mb-3 text-sm flex items-center gap-2">
                <FileText size={15} className="text-emerald-600" /> Документы закупки
              </h3>
              <TenderDocumentsPanel
                tenderId={tender.id}
                documents={requirements.tzDocuments || []}
                fallbackDocuments={requirements.tenderDocuments || []}
              />
              {requirements.requiredDocs?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">Для заявки нужно</p>
                  {requirements.requiredDocs.map((d: string, i: number) => (
                    <p key={i} className="text-xs text-slate-700 mb-1">· {d}</p>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/growth"
              className="block rounded-2xl border border-emerald-500/20 p-4 text-center hover:border-emerald-500/40 transition-all bg-emerald-50/50 dark:bg-emerald-500/5"
            >
              <TrendingUp size={18} className="mx-auto text-emerald-600 mb-1" />
              <p className="text-sm font-medium text-slate-800">Карта роста</p>
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}

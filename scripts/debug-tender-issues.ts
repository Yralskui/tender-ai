import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments, matchProductToCatalog, analyzeMatch } from "../src/lib/matching";
import { computeTenderParticipation } from "../src/lib/tenderRanking";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";

function parseReqs(requirements: string) {
  try {
    return JSON.parse(requirements) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function debugTender(search: string) {
  const tenders = await prisma.tender.findMany({
    where: {
      OR: [
        { externalId: { contains: search } },
        { title: { contains: search } },
        { requirements: { contains: search } },
      ],
    },
    take: 3,
  });

  const company = await prisma.company.findFirst({
    where: { inn: "027370199139" },
    include: { documents: true },
  });
  if (!company) {
    console.log("Company not found");
    return;
  }

  const rawDocs = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(rawDocs);
  const catalogProducts = docs.flatMap((d) => d.products || []);
  const catalogStructured = docs.flatMap((d) => d.catalogItems || []);

  for (const t of tenders) {
    const parsed = parseReqs(t.requirements);
    const analysis = analyzeMatch(
      docs,
      { okvedCodes: JSON.parse(company.okvedCodes || "[]"), revenue: company.revenue, region: company.region },
      parsed as Parameters<typeof analyzeMatch>[2],
      t.okvedCode,
      t.region,
      { title: t.title, category: t.category }
    );
    const part = computeTenderParticipation(t, catalogProducts, catalogStructured, {
      hasCatalog: catalogProducts.length > 0,
      parsedReqs: parsed,
      analysisScore: analysis.score,
      analysisBlockers: analysis.blockers,
      analysisNomenclatureMismatch: analysis.nomenclatureMismatch,
    });
    const bundles = buildProcurementBundles(parsed, t.title, catalogProducts, catalogStructured);

    console.log("\n" + "=".repeat(70));
    console.log("ID:", t.externalId);
    console.log("Title:", t.title.slice(0, 100));
    console.log("tzParsedFromFile:", parsed.tzParsedFromFile);
    console.log("productSpecs:", parsed.productSpecs?.length ?? 0);
    console.log("tzProducts:", parsed.tzProducts?.length ?? 0);
    console.log("Forecast:", part.forecast.chancePercent + "%", part.forecast.headline);
    console.log("nomMismatch:", part.nomenclatureMismatch, "familyBlocked:", part.familyBlocked);
    console.log("ru:", part.ruMatched, "/", part.ruTotal, "partial:", part.ruPartial, "missing:", part.ruMissing);
    console.log("Bundles:", bundles.length);
    for (const b of bundles) {
      console.log(`  [${b.position}] ${b.name.slice(0, 80)} → ${b.match.status} ${b.match.matchedProduct?.slice(0, 60) || ""}`);
      console.log(`    chars: ${b.characteristics.length}`);
      for (const ch of b.characteristics.slice(0, 10)) {
        console.log(`      - ${(ch.field ? ch.field + ": " : "") + (ch.value || ch.label)} → ${ch.match.status}`);
      }
    }
    console.log("analysis:", analysis.score, "blockers:", analysis.blockers.slice(0, 2));
    console.log("Nom rows:");
    for (const r of part.nomRows.slice(0, 5)) {
      console.log(`  ${r.requested.slice(0, 70)} → ${r.status} | ${r.matchedProduct?.slice(0, 50) || "—"}`);
    }
    if (bundles[0]) {
      const m = matchProductToCatalog(bundles[0].name, catalogProducts, catalogStructured);
      console.log("Direct match test:", m);
    }
  }
}

async function main() {
  console.log("Tender count:", await prisma.tender.count());
  console.log("Active:", await prisma.tender.count({ where: { status: "active" } }));
  await debugTender("чехол");
  await debugTender("0318100057226000118");
  await debugTender("халат процедурный");
  await debugTender("0744200000226005640");
  await debugTender("антисептическ");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

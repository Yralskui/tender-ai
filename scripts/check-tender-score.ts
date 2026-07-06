import { prisma } from "../src/lib/prisma";
import { computeTenderParticipation } from "../src/lib/tenderRanking";
import { loadCompanyCatalogProducts, catalogRowsToStructured } from "../src/lib/catalogProductSync";
import { mapCompanyDocuments } from "../src/lib/matching";

const externalId = process.argv[2] ?? "0340200003324000459";

async function main() {
  const tender = await prisma.tender.findFirst({
    where: externalId.length > 10
      ? { externalId: { contains: externalId } }
      : { OR: [
          { title: { contains: "марл" } },
          { title: { contains: "Марл" } },
          { title: { contains: "медицинского назначения" } },
        ] },
    orderBy: { updatedAt: "desc" },
  });
  if (!tender) {
    console.log("not found");
    return;
  }

  const r = JSON.parse(tender.requirements as string);
  console.log("title:", tender.title);
  console.log("importMode:", r.importMode);
  console.log("tzParsedFromFile:", r.tzParsedFromFile);
  console.log("tzProducts:", r.tzProducts);
  console.log("updatedAt:", tender.updatedAt);

  const company = await prisma.company.findFirst({ where: { documents: { some: {} } } });
  if (!company) return;

  const docs = await prisma.document.findMany({ where: { companyId: company.id } });
  const catalogRows = await loadCompanyCatalogProducts(company.id);
  const catalogProducts = catalogRows.map((row) => row.displayText || row.name);
  const catalogStructured = catalogRowsToStructured(catalogRows);
  const docsForMatching = mapCompanyDocuments(docs);

  const live = computeTenderParticipation(
    {
      title: tender.title,
      category: tender.category,
      okvedCode: tender.okvedCode,
      region: tender.region,
      requirements: tender.requirements,
    },
    catalogProducts,
    catalogStructured,
    { parsedReqs: r, hasCatalog: catalogProducts.length > 0 }
  );

  console.log("LIVE forecast:", live.forecast.coveragePercent, live.forecast.headline);
  console.log("LIVE ru:", live.ruMatched, "/", live.ruTotal, live.nomenclatureMismatch);

  const cached = await prisma.tenderMatch.findFirst({
    where: { companyId: company.id, tenderId: tender.id },
  });
  console.log("CACHE forecastChance:", cached?.forecastChance, "feedScore:", cached?.feedScore);
  console.log("CACHE computedAt:", cached?.computedAt, "showInFeed:", cached?.showInFeed);
  if (cached?.computedAt) {
    console.log("stale?", tender.updatedAt > cached.computedAt);
  }
}

main().finally(() => prisma.$disconnect());

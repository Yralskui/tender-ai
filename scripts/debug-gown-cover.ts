import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching, catalogProductsFromDocuments } from "../src/lib/documentQuery";
import { matchProductToCatalog, analyzeMatch, mapCompanyDocuments } from "../src/lib/matching";
import { computeTenderParticipation } from "../src/lib/tenderRanking";

async function main() {
  const c = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!c) return;
  const raw = await loadDocumentsForMatching(c.id);
  const docs = mapCompanyDocuments(raw);
  const cat = catalogProductsFromDocuments(raw);

  for (const extId of ["0318100057226000118", "0318100057226000116"]) {
    const t = await prisma.tender.findFirst({ where: { externalId: extId } });
    if (!t) continue;
    const r = JSON.parse(t.requirements) as Record<string, unknown>;
    const name = (r.tzProducts as string[])?.[0] || t.title;
    console.log("\n", extId);
    console.log("match:", matchProductToCatalog(name, cat));
    const a = analyzeMatch(
      docs,
      { okvedCodes: [], revenue: null, region: null },
      r as Parameters<typeof analyzeMatch>[2],
      null,
      null,
      { title: t.title }
    );
    const p = computeTenderParticipation(t, cat, docs.flatMap((d) => d.catalogItems || []), {
      parsedReqs: r,
      analysisScore: a.score,
      analysisNomenclatureMismatch: a.nomenclatureMismatch,
      hasCatalog: true,
    });
    console.log("forecast:", p.forecast.chancePercent + "%", p.forecast.headline);
    console.log("ru:", p.ruMatched, "partial", p.ruPartial, "total", p.ruTotal);
    console.log("mismatch:", a.nomenclatureMismatch, "blockers:", a.blockers.length);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

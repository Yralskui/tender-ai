import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments, analyzeMatch } from "../src/lib/matching";
import { detectProductFamilies, familiesAreCompatible, catalogFamiliesFromProducts } from "../src/lib/productFamilies";

function parseReqs(s: string) {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function tenderSearchLines(title: string, r: Record<string, unknown>) {
  const lines = new Set<string>();
  lines.add(title);
  for (const n of (r.tzProducts as string[]) || []) lines.add(n);
  for (const s of (r.productSpecs as string[]) || []) lines.add(s);
  return [...lines];
}

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  const raw = await loadDocumentsForMatching(company!.id);
  const docs = mapCompanyDocuments(raw);

  for (const extId of ["0318100057226000118", "0318100057226000116"]) {
    const t = await prisma.tender.findFirst({ where: { externalId: extId } });
    if (!t) continue;
    const r = parseReqs(t.requirements);
    const lines = tenderSearchLines(t.title, r);
    const tf = detectProductFamilies(lines.join(" "));
    const cf = catalogFamiliesFromProducts(docs.flatMap((d) => d.products || []));
    const a = analyzeMatch(
      docs,
      { okvedCodes: JSON.parse(company!.okvedCodes || "[]"), revenue: company!.revenue, region: company!.region },
      r as Parameters<typeof analyzeMatch>[2],
      t.okvedCode,
      t.region,
      { title: t.title, category: t.category }
    );
    console.log("\n===", extId, "===");
    console.log("tender families:", [...tf]);
    console.log("catalog families (all docs):", [...cf]);
    console.log("compatible all:", familiesAreCompatible(tf, cf));
    console.log("nomenclatureMismatch:", a.nomenclatureMismatch);
    console.log("blockers:", a.blockers);
    console.log("catalog products used:", a.catalogProducts.length);
    console.log("excluded RU:", a.excludedRuCount);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";
import { loadCompanyCatalogProducts, mergeCompanyCatalogSources } from "../src/lib/catalogProductSync";

async function inspect(externalId: string) {
  const tender = await prisma.tender.findFirst({ where: { externalId } });
  if (!tender) {
    console.log("not found", externalId);
    return;
  }
  const reqs = JSON.parse(tender.requirements) as Record<string, unknown>;
  console.log("\n===", externalId, "===");
  console.log("title:", tender.title);
  console.log("tzParsedFromFile:", reqs.tzParsedFromFile);
  console.log("tzProducts:", (reqs.tzProducts as string[])?.slice(0, 6));
  console.log("tzVolumes:", (reqs.tzVolumes as unknown[])?.slice(0, 4));
  console.log("productSpecs count:", (reqs.productSpecs as string[])?.length);
  const badSpecs = (reqs.productSpecs as string[])?.filter((s) => /^позици/i.test(s) || s.length < 15);
  console.log("suspicious specs:", badSpecs?.slice(0, 8));

  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const raw = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(raw);
  const rows = await loadCompanyCatalogProducts(company.id);
  const merged = mergeCompanyCatalogSources({ catalogRows: rows, docsForMatching: docs });

  const bundles = buildProcurementBundles(reqs, tender.title, merged.catalogProducts, merged.catalogStructured);
  for (const b of bundles) {
    console.log(`bundle #${b.position}:`, b.name.slice(0, 90), "| chars:", b.characteristics.length, "| ktru:", b.ktruCode);
    for (const ch of b.characteristics.slice(0, 5)) {
      console.log("  ", ch.field || ch.label, ":", (ch.value || "").slice(0, 50));
    }
  }
}

async function main() {
  const tenders = await prisma.tender.findMany({
    where: {
      OR: [
        { requirements: { contains: "фартук" } },
        { title: { contains: "фартук" } },
      ],
    },
    take: 12,
  });

  for (const t of tenders) {
    const r = JSON.parse(t.requirements) as { tzProducts?: string[]; tzVolumes?: Array<{ name: string }> };
    const hasApron = (r.tzProducts || []).some((p) => /фартук/i.test(p)) ||
      (r.tzVolumes || []).some((v) => /фартук/i.test(v.name || ""));
    if (hasApron || /фартук/i.test(t.title)) {
      await inspect(t.externalId);
    }
  }

  // Also find bundles named just "позиция"
  const withPlaceholder = await prisma.tender.findMany({
    where: { requirements: { contains: '"name":"позиция"' } },
    take: 5,
  });
  console.log("\n=== tenders with placeholder volume name ===", withPlaceholder.map((t) => t.externalId));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

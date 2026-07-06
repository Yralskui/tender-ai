import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";
import { mapCompanyDocuments } from "../src/lib/matching";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const raw = await loadDocumentsForMatching(company.id);
  const docs = mapCompanyDocuments(raw);

  for (const d of docs) {
    const items = d.catalogItems?.length ?? 0;
    const products = d.products?.length ?? 0;
    console.log("\n---", d.name?.slice(0, 70));
    console.log("type:", d.type, "relevant:", d.isRelevant, "products:", products, "catalogItems:", items);
    if (products > 0) {
      const caps = (d.products || []).filter((p) => /шапоч|берет/i.test(p));
      console.log("cap lines:", caps.length, caps.slice(0, 3).map((p) => p.slice(0, 60)));
    }
  }

  const tenders = await prisma.tender.findMany({
    where: { requirements: { contains: "14.12.30.190" } },
    take: 8,
  });
  for (const t of tenders) {
    const r = JSON.parse(t.requirements) as {
      tzVolumes?: Array<{ quantity: number; unit: string; name: string; ktruCode?: string }>;
      tzProducts?: string[];
    };
    const vol = r.tzVolumes?.find((v) => /шапоч/i.test(v.name || ""));
    console.log("\nTender", t.externalId, vol ? `${vol.quantity} ${vol.unit}` : "no vol", r.tzProducts?.[0]?.slice(0, 50));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

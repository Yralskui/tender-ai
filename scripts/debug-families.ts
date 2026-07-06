import { prisma } from "../src/lib/prisma";
import { loadDocumentsForMatching, catalogProductsFromDocuments } from "../src/lib/documentQuery";
import {
  detectProductFamilies,
  familiesAreCompatible,
  catalogFamiliesFromProducts,
  describeTenderFamilies,
  describeCatalogFamilies,
} from "../src/lib/productFamilies";
import { matchProductToCatalog } from "../src/lib/matching";
import { mapCompanyDocuments } from "../src/lib/matching";

function parseReqs(s: string) {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  const docs = await loadDocumentsForMatching(company!.id);
  const mapped = mapCompanyDocuments(docs);
  const cat = catalogProductsFromDocuments(docs);

  const wipe = cat.filter((p) => /салфет/i.test(p));
  console.log("Salфетки in catalog:", wipe.length);
  for (const w of wipe.slice(0, 20)) console.log(" ", w.slice(0, 90));

  for (const extId of ["0318100057226000118", "0318100057226000116", "0744200000226005640"]) {
    const t = await prisma.tender.findFirst({ where: { externalId: extId } });
    if (!t) continue;
    const r = parseReqs(t.requirements);
    const blob = [t.title, ...(r.tzProducts as string[] || []), ...(r.productSpecs as string[] || []).slice(0, 20)].join(" ");
    const tf = detectProductFamilies(blob);
    const cf = catalogFamiliesFromProducts(cat);
    console.log("\n===", extId, "===");
    console.log("tender families:", [...tf]);
    console.log("catalog families:", [...cf]);
    console.log("compatible:", familiesAreCompatible(tf, cf));
    console.log("describe:", describeTenderFamilies(tf), "|", describeCatalogFamilies(cf));
    const name = (r.tzProducts as string[])?.[0] || t.title;
    console.log("match:", matchProductToCatalog(name.replace(/^поставка[^(]*\(/i, "").slice(0, 80), cat));
    console.log("productSpecs:", (r.productSpecs as string[])?.length);
    if (extId === "0744200000226005640") {
      console.log("specs:", (r.productSpecs as string[])?.join("\n"));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

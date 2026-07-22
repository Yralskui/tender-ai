import { prisma } from "../src/lib/prisma";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";
import { resolveTzVolumes } from "../src/lib/tzVolumes";

async function main() {
  const ids = process.argv.slice(2);

  for (const externalId of ids) {
    const tender = await prisma.tender.findFirst({ where: { externalId } });
    if (!tender) {
      console.log(externalId, "NOT FOUND");
      continue;
    }
    const reqs = JSON.parse(tender.requirements || "{}");
    const result = await enrichNoticeFromTzCache(externalId, {
      htmlProductSpecs: reqs.productSpecs,
      htmlTechnicalAssignment: reqs.technicalAssignment,
      htmlKtruCodes: reqs.ktruCodes,
    });

    if (!result) {
      console.log(externalId, "no cached files / no result");
      continue;
    }

    const tzVolumes = resolveTzVolumes({
      tzVolumes: result.tzVolumes as any,
      productSpecs: result.productSpecs,
      tzProducts: result.products,
      technicalAssignment: result.technicalAssignment,
    });

    console.log(
      externalId,
      "-> specs:", result.productSpecs.length,
      "products:", result.products.length,
      "tzVolumes:", tzVolumes.length,
      tzVolumes.length > 0 ? JSON.stringify(tzVolumes.map((v) => `${v.name}: ${v.quantity} ${v.unit}`)) : ""
    );

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        requirements: JSON.stringify({
          ...reqs,
          productSpecs: result.productSpecs,
          tzProducts: result.products,
          ktruCodes: result.ktruCodes,
          tzVolumes,
          tzDocuments: result.documents,
          tzParsedFromFile: result.tzParsedFromFile,
          tzReparsedAt: new Date().toISOString(),
        }),
      },
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

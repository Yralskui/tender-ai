import { prisma } from "../src/lib/prisma";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";
import { toImportedTender } from "../src/lib/zakupkiImport";
import { normalizeStoredRequirements } from "../src/lib/textNormalize";

const tenderId = process.argv[2] || "cmqg6dzy800043gviy651a1ai";
const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
if (!tender) throw new Error("not found");

const reqs = JSON.parse(tender.requirements);
const tz = await enrichNoticeFromTzCache(tender.externalId, {
  htmlProductSpecs: reqs.productSpecs || [],
  htmlTechnicalAssignment: reqs.technicalAssignment || "",
  htmlKtruCodes: reqs.ktruCodes || [],
});

if (!tz?.tzParsedFromFile) {
  console.log("cache parse failed", tz);
  process.exit(1);
}

const entry = {
  regNumber: tender.externalId,
  noticeType: reqs.noticeType || "zk20",
  procedureType: reqs.procedureType || "44-ФЗ",
  status: reqs.eisStage || "",
  title: tender.title,
  customerName: tender.customerName,
  price: tender.price,
  publishedAt: tender.publishedAt,
  deadline: tender.deadline,
  sourceUrl: tender.sourceUrl || "",
};

const details = {
  productSpecs: tz.productSpecs,
  technicalAssignment: tz.technicalAssignment,
  ktruCodes: tz.ktruCodes,
  tzDocuments: tz.documents,
  tzParsedFromFile: true,
  tzProducts: tz.products,
};

const imported = toImportedTender(entry, details, {
  category: tender.category,
  okved: tender.okvedCode || "46.46",
});

const requirements = normalizeStoredRequirements(imported.requirements);
await prisma.tender.update({
  where: { id: tender.id },
  data: { requirements: JSON.stringify(requirements) },
});

console.log(
  JSON.stringify(
    {
      tzParsedFromFile: requirements.tzParsedFromFile,
      specCount: requirements.productSpecs?.length,
      products: requirements.tzProducts,
    },
    null,
    2
  )
);

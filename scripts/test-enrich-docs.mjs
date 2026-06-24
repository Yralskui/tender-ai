import { prisma } from "../src/lib/prisma";
import { enrichNoticeFromTzDocuments } from "../src/lib/zakupkiDocuments";

const tenderId = process.argv[2] || "cmqg6dzy800043gviy651a1ai";
const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
if (!tender) throw new Error("not found");

const reqs = JSON.parse(tender.requirements);
const noticeType = reqs.noticeType || "ea20";
console.log("noticeType", noticeType);

const tz = await enrichNoticeFromTzDocuments(tender.externalId, noticeType, {
  htmlProductSpecs: reqs.productSpecs || [],
  htmlTechnicalAssignment: reqs.technicalAssignment || "",
  htmlKtruCodes: reqs.ktruCodes || [],
});

console.log(
  JSON.stringify(
    {
      tzParsedFromFile: tz?.tzParsedFromFile,
      specCount: tz?.productSpecs?.length,
      products: tz?.products,
      documents: tz?.documents,
    },
    null,
    2
  )
);

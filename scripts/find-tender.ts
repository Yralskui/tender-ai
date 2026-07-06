import { prisma } from "../src/lib/prisma";

async function main() {
  const q = process.argv[2] || "шапоч";
  const tenders = await prisma.tender.findMany({
    where: { title: { contains: q } },
    take: 3,
    select: { id: true, externalId: true, title: true, requirements: true },
  });
  for (const t of tenders) {
    console.log("---", t.id, t.externalId);
    console.log(t.title.slice(0, 80));
    const r = JSON.parse(t.requirements as string);
    console.log("noticeType", r.noticeType, "tzDocs", r.tzDocuments?.length, "importMode", r.importMode);
    if (r.tzDocuments?.length) console.log(r.tzDocuments);
  }
}

main().finally(() => prisma.$disconnect());

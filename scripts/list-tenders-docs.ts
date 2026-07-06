import { prisma } from "../src/lib/prisma";

async function main() {
  const tenders = await prisma.tender.findMany({
    where: { importedFromEis: true, status: "active" },
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: { id: true, externalId: true, title: true, requirements: true },
  });
  for (const t of tenders) {
    const r = JSON.parse(t.requirements as string);
    const tz = Array.isArray(r.tzDocuments) ? r.tzDocuments.length : 0;
    const td = Array.isArray(r.tenderDocuments) ? r.tenderDocuments.length : 0;
    console.log(t.id, t.externalId.slice(0, 20), "tz:", tz, "tender:", td, r.noticeType);
  }
}

main().finally(() => prisma.$disconnect());

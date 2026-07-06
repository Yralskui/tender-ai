import { prisma } from "../src/lib/prisma";

async function main() {
  const now = new Date();
  const total = await prisma.tender.count();
  const importedEis = await prisma.tender.count({ where: { importedFromEis: true } });
  const activeEis = await prisma.tender.count({
    where: { status: "active", importedFromEis: true },
  });
  const expiredEis = await prisma.tender.count({
    where: { deadline: { lt: now }, importedFromEis: true },
  });
  const notEis = await prisma.tender.count({ where: { importedFromEis: false } });
  const showInFeed = await prisma.tenderMatch.count({ where: { showInFeed: true } });
  const showInProfile = await prisma.tenderMatch.count({ where: { showInProfile: true } });

  console.log(
    JSON.stringify(
      { total, importedEis, activeEis, expiredEis, notEis, showInFeed, showInProfile },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

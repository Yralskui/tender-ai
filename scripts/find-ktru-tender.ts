import { prisma } from "../src/lib/prisma";

async function main() {
  const code = process.argv[2] || "00000336";
  const tenders = await prisma.tender.findMany({
    where: { requirements: { contains: code } },
    select: { id: true, externalId: true, title: true },
    take: 5,
  });
  console.log(tenders);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

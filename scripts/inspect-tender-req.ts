import { prisma } from "../src/lib/prisma";

const id = process.argv[2] ?? "cmr145ybv00247ssy1rvmbst6";

async function main() {
  const t = await prisma.tender.findUnique({
    where: { id },
    select: { externalId: true, requirements: true },
  });
  console.log(JSON.stringify(t, null, 2));
}

main()
  .finally(() => prisma.$disconnect());

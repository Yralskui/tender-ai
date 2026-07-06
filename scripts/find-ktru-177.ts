import { prisma } from "../src/lib/prisma";

async function main() {
  const tenders = await prisma.tender.findMany({
    where: {
      OR: [
        { requirements: { contains: "00000177" } },
        { requirements: { contains: "14.12.30.190-00000177" } },
      ],
    },
    take: 10,
  });
  for (const t of tenders) {
    const r = JSON.parse(t.requirements) as {
      tzVolumes?: Array<{ quantity: number; unit: string; name: string; ktruCode?: string; position?: string }>;
      tzProducts?: string[];
    };
    const cap = r.tzVolumes?.find((v) => /шапоч/i.test(v.name || "") || v.ktruCode?.includes("00000177"));
    console.log(t.externalId, cap ? `${cap.position || "?"} ${cap.quantity} ${cap.unit} ${cap.ktruCode}` : "no cap vol");
    console.log("  products:", r.tzProducts?.length, r.tzProducts?.filter((p) => /шапоч/i.test(p)).map((p) => p.slice(0, 60)));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

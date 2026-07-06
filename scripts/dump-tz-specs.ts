import { prisma } from "../src/lib/prisma";

async function main() {
  const tender = await prisma.tender.findFirst({ where: { externalId: "0372200041826000050" } });
  if (!tender) return;
  const r = JSON.parse(tender.requirements) as { productSpecs?: string[] };
  let pos = "";
  for (const s of r.productSpecs || []) {
    if (/Позиция\s*ТЗ\s*№/i.test(s)) {
      pos = s;
      console.log("\n" + pos);
      continue;
    }
    if (/Позиция\s*ТЗ:/i.test(s)) {
      console.log(s);
      continue;
    }
    if (pos.includes("№: 1") || pos.includes("№:1")) {
      if (/поз\.?\s*1|шапоч/i.test(s) || !/поз\.?\s*2/i.test(s)) console.log("  ", s);
    }
    if (pos.includes("№: 2") || pos.includes("№:2")) {
      console.log("  ", s);
    }
  }
}

main().finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";
import { loadCompanyCatalogProducts } from "../src/lib/catalogProductSync";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;
  const rows = await loadCompanyCatalogProducts(company.id);
  console.log("catalog rows:", rows.length);
  const caps = rows.filter((r) => /шапоч|берет/i.test(r.name + r.displayText));
  console.log("cap rows:", caps.length);
  for (const r of caps.slice(0, 10)) {
    console.log(" ", r.displayText?.slice(0, 80) || r.name?.slice(0, 80));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

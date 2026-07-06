import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { ingestPricelistDocument } from "../src/lib/supplierPriceSync";

async function main() {
  const company = await prisma.company.findFirst({ where: { inn: "027370199139" } });
  if (!company) return;

  const docs = await prisma.document.findMany({
    where: {
      companyId: company.id,
      OR: [{ name: { contains: "спец.цена" } }, { name: { contains: "Прайс-описание" } }],
    },
  });

  for (const doc of docs) {
    const filePath = path.join(process.cwd(), "public", doc.fileUrl.replace(/^\//, ""));
    const buffer = await readFile(filePath);
    const result = await ingestPricelistDocument(doc.id, company.id, buffer, doc.name);
    console.log(doc.name, "->", result.count, "items", result.warning || "ok");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

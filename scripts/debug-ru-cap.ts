import { prisma } from "../src/lib/prisma";

async function main() {
  const doc = await prisma.document.findFirst({
    where: { name: { contains: "РЗН 2019_8679" } },
  });
  if (!doc) return;
  const ex = JSON.parse(doc.extractedData || "{}");
  console.log("name:", doc.name);
  console.log("type:", doc.type, "status:", doc.status);
  console.log("products:", ex.products?.length, ex.productCount);
  console.log("catalogItems:", ex.catalogItems?.length);
  console.log("summary:", ex.summary?.slice(0, 200));
  console.log("warning:", ex.warning?.slice(0, 200));
  console.log("sample products:", ex.products?.slice(0, 5));
  console.log("sample catalog:", ex.catalogItems?.slice(0, 3));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

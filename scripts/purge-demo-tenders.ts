/**
 * Удаляет все учебные/фейковые тендеры, оставляет только importedFromEis.
 * npx tsx scripts/purge-demo-tenders.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { purgeNonEisTenders } from "../src/lib/tenderQuery";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const before = await prisma.tender.count();
  const removed = await purgeNonEisTenders(prisma);
  const after = await prisma.tender.count();
  console.log(`Удалено: ${removed} (было ${before}, осталось ${after} реальных с ЕИС)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

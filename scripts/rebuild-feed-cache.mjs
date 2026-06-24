/**
 * Полная пересборка кэша ленты (после batch-enrich-tz).
 *   npx tsx scripts/rebuild-feed-cache.mjs
 */
import { prisma } from "../src/lib/prisma.ts";
import { rebuildCompanyFeedCache } from "../src/lib/tenderFeedCache.ts";

await prisma.$executeRawUnsafe("PRAGMA busy_timeout=60000");

const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
if (!company) {
  console.error("Компания не найдена в базе.");
  process.exit(1);
}

console.log(`Пересборка кэша ленты для компании ${company.id.slice(0, 8)}…`);
console.log("Остановите npm run dev, если зависает на SQLite.\n");

const started = Date.now();
const result = await rebuildCompanyFeedCache(company.id, { full: true });
const sec = ((Date.now() - started) / 1000).toFixed(1);

console.log(`Готово за ${sec} с. Обработано закупок: ${result.processed}`);
process.exit(0);

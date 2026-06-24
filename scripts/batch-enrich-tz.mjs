/**
 * Массовый разбор ТЗ для закупок с tzEnrichmentPending.
 *
 * Один пакет (до 500 за раз):
 *   npx tsx scripts/batch-enrich-tz.mjs 100
 *
 * На ночь — крутить пакеты, пока очередь не опустеет:
 *   npx tsx scripts/batch-enrich-tz.mjs --all
 *   npx tsx scripts/batch-enrich-tz.mjs --all 80   (80 закупок за пакет)
 */
import {
  countPendingTzEnrichment,
  enrichPendingTendersInBackground,
  getTzEnrichmentState,
} from "../src/lib/tzEnrichmentJob.ts";
import { prisma } from "../src/lib/prisma.ts";

const args = process.argv.slice(2);
const runAll = args.includes("--all");
const limitArg = args.find((a) => !a.startsWith("--"));
const batchSize = Math.max(1, Math.min(500, parseInt(limitArg || (runAll ? "50" : "80"), 10) || 80));

await prisma.$executeRawUnsafe("PRAGMA busy_timeout=60000");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBatch() {
  while (getTzEnrichmentState().running) {
    const s = getTzEnrichmentState();
    process.stdout.write(`\r${s.lastMessage} · обработано ${s.processed}, разобрано ${s.enriched}   `);
    await sleep(1500);
  }
  process.stdout.write("\n");
  return getTzEnrichmentState();
}

async function runOneBatch(label) {
  const pendingBefore = await countPendingTzEnrichment();
  if (pendingBefore === 0) {
    console.log("Очередь пуста — нечего разбирать.");
    return { processed: 0, enriched: 0, pendingBefore: 0, pendingAfter: 0 };
  }

  const take = Math.min(batchSize, pendingBefore);
  console.log(`${label}В очереди ${pendingBefore}. Берём ${take} закупок…`);

  await enrichPendingTendersInBackground(take, { skipFeedCache: true });
  const result = await waitForBatch();
  const pendingAfter = await countPendingTzEnrichment();

  console.log(
    `Пакет готов: обработано ${result.processed}, разобрано из файла ${result.enriched}, осталось ${pendingAfter}`
  );

  return {
    processed: result.processed,
    enriched: result.enriched,
    pendingBefore,
    pendingAfter,
  };
}

if (runAll) {
  console.log(`Ночной режим: пакеты по ${batchSize}, пауза 3 с между пакетами.`);
  console.log("Совет: остановите npm run dev — иначе база может подвисать.\n");
  let batchNo = 0;
  let totalProcessed = 0;
  let totalEnriched = 0;

  while (true) {
    const pending = await countPendingTzEnrichment();
    if (pending === 0) break;

    batchNo += 1;
    const stats = await runOneBatch(`[пакет ${batchNo}] `);
    totalProcessed += stats.processed;
    totalEnriched += stats.enriched;

    if (stats.pendingAfter === 0) break;
    if (stats.processed === 0) {
      console.log("Пакет не обработал ни одной закупки — останавливаемся.");
      break;
    }

    const queueMoved = stats.pendingBefore - stats.pendingAfter;
    if (queueMoved < 3 && stats.enriched === 0 && stats.processed >= 20) {
      console.log(
        "\n⚠ Похоже, нет связи с zakupki.gov.ru (очередь почти не двигается). Пауза 2 мин…"
      );
      console.log("Проверьте интернет и откройте https://zakupki.gov.ru в браузере.");
      await sleep(120_000);
    }

    await sleep(3000);
  }

  const left = await countPendingTzEnrichment();
  console.log("\n=== Итог ===");
  console.log(`Пакетов: ${batchNo}`);
  console.log(`Обработано: ${totalProcessed}, разобрано из файла: ${totalEnriched}`);
  console.log(`Осталось в очереди: ${left}`);
  if (left > 0) {
    console.log("Запустите снова: npx tsx scripts/batch-enrich-tz.mjs --all");
  } else {
    console.log("Все активные закупки прошли разбор ТЗ. Обновите ленту в браузере.");
    console.log("Пересборка кэша: npx tsx scripts/rebuild-feed-cache.mjs");
  }
  process.exit(0);
}

console.log(`Один пакет: до ${batchSize} закупок (макс. 500). Для всей очереди: --all\n`);
await runOneBatch("");
const left = await countPendingTzEnrichment();
console.log(`В очереди ещё ${left}. Для продолжения: npx tsx scripts/batch-enrich-tz.mjs --all`);
process.exit(0);

import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.notification.findMany({
    where: { tenderId: { not: null } },
    select: { userId: true, type: true, tenderId: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const byTenderUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.userId}|${r.tenderId}`;
    if (!byTenderUser.has(key)) byTenderUser.set(key, []);
    byTenderUser.get(key)!.push(r);
  }

  let multiType = 0;
  for (const [key, group] of byTenderUser) {
    if (group.length < 2) continue;
    const types = new Set(group.map((g) => g.type));
    if (types.size < 2) continue;
    const spanH =
      (Math.max(...group.map((g) => g.createdAt.getTime())) -
        Math.min(...group.map((g) => g.createdAt.getTime()))) /
      3600000;
    if (spanH < 168) {
      multiType++;
      console.log(`\n${key} (${spanH.toFixed(0)}h span, ${group.length} notifs)`);
      for (const g of group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        console.log(`  [${g.type}] ${g.createdAt.toISOString().slice(0, 16)} ${g.title.slice(0, 50)}`);
      }
    }
  }

  console.log("\nTenders with multiple notification TYPES within 7d:", multiType);
}

main().finally(() => prisma.$disconnect());

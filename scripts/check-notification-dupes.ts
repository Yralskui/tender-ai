import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.notification.findMany({
    select: {
      id: true,
      userId: true,
      type: true,
      tenderId: true,
      documentId: true,
      title: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.userId}|${r.type}|${r.tenderId ?? ""}|${r.documentId ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  let dupGroups = 0;
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 1; i < group.length; i++) {
      const hours = (group[i].createdAt.getTime() - group[i - 1].createdAt.getTime()) / 3600000;
      if (hours < 168) {
        dupGroups++;
        console.log("\n--- possible duplicate ---");
        console.log("key:", key);
        console.log("gap hours:", hours.toFixed(1));
        for (const g of group) {
          console.log(`  ${g.createdAt.toISOString()} ${g.title.slice(0, 60)}`);
        }
        break;
      }
    }
  }

  console.log("\nTotal notifications (sample):", rows.length);
  console.log("Duplicate groups (same user+type+tender/doc within 7d):", dupGroups);

  const typeCounts = await prisma.notification.groupBy({
    by: ["type"],
    _count: true,
  });
  console.log("\nBy type:", typeCounts);
}

main().finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";
import { listTenderIdsByLabel, listAllTaggedTenderIds } from "../src/lib/tenderLabels";
import { loadTenderFeedPage } from "../src/lib/tenderFeedPage";
import { loadDocumentsForMatching } from "../src/lib/documentQuery";

async function main() {
  const user = await prisma.user.findFirst({
    where: { company: { isNot: null } },
    include: { company: true },
  });
  if (!user?.company) {
    console.log("no company user");
    return;
  }

  const companyId = user.company.id;
  const labels = await prisma.tenderLabel.findMany({ where: { companyId } });
  const allTagged = await listAllTaggedTenderIds(companyId);

  console.log("User:", user.name, "company:", companyId);
  console.log("All tagged tender ids:", allTagged.length, allTagged);

  for (const label of labels) {
    const ids = await listTenderIdsByLabel(companyId, label.id);
    const count = await prisma.tenderLabelAssignment.count({
      where: { companyId, labelId: label.id },
    });
    console.log(`Label "${label.name}" (${label.id}): assignments=${count}, ids=${ids.length}`);
  }

  let okvedCodes: string[] = [];
  try {
    okvedCodes = JSON.parse(user.company.okvedCodes || "[]");
  } catch {}

  const documents = await loadDocumentsForMatching(companyId);
  const company = {
    id: user.company.id,
    revenue: user.company.revenue,
    region: user.company.region,
    description: user.company.description,
  };

  const allPage = await loadTenderFeedPage({
    okvedCodes,
    documents,
    company,
    feedMode: "tagged",
    offset: 0,
    limit: 40,
  });
  console.log("\nFeed tagged (all):", allPage.items.length, "titles:", allPage.items.map((i) => i.title.slice(0, 40)));

  const interesting = labels.find((l) => l.name.toLowerCase().includes("интерес"));
  if (interesting) {
    const tagPage = await loadTenderFeedPage({
      okvedCodes,
      documents,
      company,
      feedMode: "tagged",
      tagId: interesting.id,
      offset: 0,
      limit: 40,
    });
    console.log(
      `\nFeed tagged label "${interesting.name}":`,
      tagPage.items.length,
      "titles:",
      tagPage.items.map((i) => i.title.slice(0, 40))
    );
  }

  const matchedPage = await loadTenderFeedPage({
    okvedCodes,
    documents,
    company,
    feedMode: "matched",
    offset: 0,
    limit: 40,
  });
  console.log("\nFeed matched:", matchedPage.items.length);
}

main().finally(() => prisma.$disconnect());

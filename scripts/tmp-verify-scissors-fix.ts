import { enrichTenderById } from "../src/lib/tzEnrichmentJob";
import { prisma } from "../src/lib/prisma";

async function main() {
  const id = "cmru79zhm01ksdkvinp5eldgx";
  const result = await enrichTenderById(id, { skipFeedCache: true });
  console.log("result:", result.message, result.success);
  const t = await prisma.tender.findUnique({ where: { id } });
  const reqs = JSON.parse(t!.requirements as string);
  console.log("tzVolumes:", JSON.stringify(reqs.tzVolumes, null, 2));
  console.log(
    "productSpecs (Позиция ТЗ lines):",
    (reqs.productSpecs || []).filter((s: string) => /^Позиция ТЗ:/.test(s))
  );
}

main().then(() => process.exit(0));

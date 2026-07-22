import { prisma } from "../src/lib/prisma";
import { resolveTzVolumes } from "../src/lib/tzVolumes";

async function main() {
  const t = await prisma.tender.findUnique({ where: { externalId: "0320100025526000037" } });
  const reqs = JSON.parse(t!.requirements as string);
  console.log("has nationalRegime:", !!reqs.nationalRegime);
  const volumes = resolveTzVolumes(reqs);
  console.log(JSON.stringify(volumes, null, 2));
}

main().then(() => process.exit(0));

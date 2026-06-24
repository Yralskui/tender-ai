import { importMedicalTendersFromEis } from "../src/lib/zakupkiImport";

async function main() {
  const result = await importMedicalTendersFromEis({
    limit: 3,
    recordsPerQuery: 3,
    concurrency: 2,
    onProgress: (m) => console.log(m),
  });

  console.log("\n=== RESULT ===");
  console.log("scanned", result.scanned, "imported", result.imported, "errors", result.errors.length);
  for (const t of result.tenders) {
    console.log("\n---", t.externalId, t.title.slice(0, 80));
    console.log("platform", t.requirements.platform);
    console.log("specs", (t.requirements.productSpecs as string[] | undefined)?.slice(0, 5));
  }
}

main().catch(console.error);

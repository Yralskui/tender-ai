import { readFileSync, existsSync } from "fs";
import { enrichNoticeFromTzCache, enrichNoticeFromTzDocuments } from "../src/lib/zakupkiDocuments";
import { parseOozDocxBuffer } from "../src/lib/tzDocumentParse";
import { sanitizeTzParseResult } from "../src/lib/tzSanitizer";
import { buildProcurementBundles } from "../src/lib/tzProcurementBundles";

const externalId = process.argv[2] || "0372200115726000039";

async function main() {
  let enriched = await enrichNoticeFromTzCache(externalId);
  if (!enriched) {
    console.log("No cache, fetching from EIS...");
    enriched = await enrichNoticeFromTzDocuments(externalId, "ea20", { maxDocuments: 8 });
  }
  if (!enriched) {
    console.log("enrich failed");
    return;
  }

  const sanitized = sanitizeTzParseResult({
    products: enriched.products,
    productSpecs: enriched.productSpecs,
    technicalAssignment: enriched.technicalAssignment,
    ktruCodes: enriched.ktruCodes,
    hasRuRequirement: true,
    tzVolumes: enriched.tzVolumes,
    productBlocks: enriched.productBlocks,
  });

  console.log("docs:", enriched.documents?.map((d) => `${d.name} (${d.specCount})`));
  console.log("sanitized products:", sanitized.products.length);
  console.log("sanitized specs:", sanitized.productSpecs.length);
  console.log("blocks:", sanitized.productBlocks?.length ?? 0);

  for (const b of sanitized.productBlocks || []) {
    console.log(`#${b.position} ${b.name} [${b.code}] chars=${b.characteristics.length}`);
  }

  const orphans = sanitized.productSpecs.filter(
    (s) => !s.includes(" — ") && !/^Позиция/i.test(s) && !/^КТРУ:/i.test(s)
  );
  console.log("\norphan specs (no product prefix):", orphans.length);
  for (const o of orphans.slice(0, 15)) console.log(" ", o);

  const bundles = buildProcurementBundles(sanitized, "test", [], []);
  console.log("\n--- bundles ---");
  for (const b of bundles) {
    console.log(`#${b.position} ${b.name} (${b.characteristics.length} chars)`);
    for (const c of b.characteristics) console.log(`  - ${c.label}`);
  }

  const cacheDir = `data/tz-cache/${externalId}`;
  if (existsSync(cacheDir)) {
    const docx = enriched.documents?.find((d) => /\.docx$/i.test(d.name));
    if (docx?.cachedPath && existsSync(docx.cachedPath)) {
      const buf = readFileSync(docx.cachedPath);
      const raw = parseOozDocxBuffer(buf);
      console.log("\n--- raw parseOozDocx ---");
      console.log("products:", raw?.products.length, "blocks:", raw?.productBlocks?.length);
      for (const b of raw?.productBlocks || []) {
        console.log(`  #${b.position} ${b.name} [${b.code}] chars=${b.characteristics.length}`);
      }
    }
  }
}

main().catch(console.error);

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { parsePricelistText } = await import("../src/lib/pricelistParser.ts");
  const { extractTextFromPdfBuffer } = await import("../src/lib/pdfText.ts");
  const { buildTenderEconomics } = await import("../src/lib/tenderEconomics.ts");

  const files = [
    "Прайс от 01.05.2026 спец.цена-2.pdf",
    "Прайс-описание ООО Инмедиз на 13.04.2026г().pdf",
  ];

  const tenderName = "Шапочка хирургическая, одноразового использования, нестерильная";
  const pricelists = files.map((name, i) => ({
    documentId: `doc-${i}`,
    label: name.replace(/\.pdf$/i, ""),
    vendor: name.includes("Инмедиз") ? "Инмедиз" : "Поставщик",
  }));

  const itemsByDoc = [];
  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const p = path.join(root, "..", "data", "sample-pricelists", name);
    const buf = await readFile(p);
    const text = await extractTextFromPdfBuffer(buf);
    const parsed = parsePricelistText(text || "", { fileName: name, vendor: pricelists[i].vendor });
    itemsByDoc.push(...parsed.map((item) => ({ ...item, documentId: pricelists[i].documentId, companyId: "test", id: "", position: 0, unitPriceSterile: item.unitPriceSterile ?? null, thicknessUm: item.thicknessUm ?? null, densityGsm: item.densityGsm ?? null, sizeText: item.sizeText ?? null, colorText: item.colorText ?? null, materialText: item.materialText ?? null, packRatio: item.packRatio ?? null, elasticType: item.elasticType ?? null, categoryText: item.categoryText ?? null })));
  }

  const econ = buildTenderEconomics(
    [{ name: tenderName, quantity: 1000, unit: "шт" }],
    tenderName,
    3360,
    itemsByDoc,
    pricelists
  );

  const line = econ.lines[0];
  console.log("Tender:", tenderName);
  console.log("Multi pricelist:", econ.multiPricelist);
  console.log("\nPer pricelist:");
  for (const m of line.pricelistMatches) {
    console.log(`  ${m.pricelistLabel}: ${m.unitPrice} ₽ → ${m.lineCost} ₽ | ${m.matchedPriceName?.slice(0, 60)}`);
  }
  console.log("\nSummaries:");
  for (const s of econ.pricelistSummaries) {
    console.log(`  ${s.label}: cost ${s.costTotal} margin ${s.marginPercent}%`);
  }
}

main().catch(console.error);

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { parsePricelistText } = await import("../src/lib/pricelistParser.ts");
  const { extractTextFromPdfBuffer } = await import("../src/lib/pdfText.ts");

  const files = [
    "Прайс от 01.05.2026 спец.цена-2.pdf",
    "Прайс-описание ООО Инмедиз на 13.04.2026г().pdf",
  ];

  for (const name of files) {
    const p = path.join(root, "..", "data", "sample-pricelists", name);
    const buf = await readFile(p);
    const text = await extractTextFromPdfBuffer(buf);
    const items = parsePricelistText(text || "", { fileName: name });
    console.log(`\n=== ${name} ===`);
    console.log(`positions: ${items.length}`);
    console.log(items.slice(0, 5).map((i) => `${i.unitPrice}${i.unitPriceSterile ? "/" + i.unitPriceSterile : ""} ₽ · ${i.name.slice(0, 60)}`));
    console.log("...");
    console.log(items.slice(-3).map((i) => `${i.unitPrice} ₽ · ${i.name.slice(0, 50)}`));
  }
}

main().catch(console.error);

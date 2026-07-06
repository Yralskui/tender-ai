import { readFileSync } from "fs";
import { parseOozDocxBuffer } from "../src/lib/tzDocumentParse";

const buffer = readFileSync(
  "data/tz-cache/0124200000626004474/0124200000626004474_Описание_объекта_закупки.docx"
);
const parsed = parseOozDocxBuffer(buffer)!;
console.log("source", parsed.source, "quality", parsed.quality);
console.log("products", parsed.products.length);

for (let pos = 1; pos <= 7; pos++) {
  const prefix = parsed.productSpecs.filter((s) => s.includes(" — ") && !s.startsWith("Позиция"));
  const blockSpecs = prefix.filter((s) => {
    const posLine = parsed.productSpecs.find((x) => x === `Позиция ТЗ №: ${pos}`);
    if (!posLine) return false;
    const nameLine = parsed.productSpecs[parsed.productSpecs.indexOf(posLine) + 1];
    const product = nameLine?.replace(/^Позиция ТЗ:\s*/, "") || "";
    return s.startsWith(product.slice(0, 40));
  });
  const byPos = parsed.productSpecs.filter((s) => {
    const idx = parsed.productSpecs.findIndex((x) => x === `Позиция ТЗ №: ${pos}`);
    if (idx < 0) return false;
    const nextPos = parsed.productSpecs.findIndex((x, i) => i > idx && /^Позиция ТЗ №:/.test(x));
    const end = nextPos < 0 ? parsed.productSpecs.length : nextPos;
    return iBetween(parsed.productSpecs, idx, end, s) && s.includes(" — ");
  });
  console.log(`\n#${pos} char specs:`, byPos.length);
  byPos.forEach((s) => console.log(" ", s.slice(0, 120)));
}

function iBetween(arr: string[], start: number, end: number, s: string) {
  const i = arr.indexOf(s);
  return i > start && i < end;
}

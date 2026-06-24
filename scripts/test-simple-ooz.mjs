import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// Compiled path via tsx
const { parseSimpleOozTable } = await import("tsx/esm").then(() =>
  import("../src/lib/docxTableParser.ts")
);

const path =
  process.argv[2] ||
  "data/tz-cache/0369300010726000064/0369300010726000064_Техническое_задание.docx";
const buf = fs.readFileSync(path);
const r = parseSimpleOozTable(buf);
console.log(JSON.stringify({
  products: r?.products,
  specCount: r?.productSpecs?.length,
  charCount: r?.productBlocks?.[0]?.characteristics?.length,
  chars: r?.productBlocks?.[0]?.characteristics,
}, null, 2));

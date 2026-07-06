import { parseMedicalTextileOozXlsx } from "../src/lib/medicalTextileOozParser";
import { readFile } from "fs/promises";
import path from "path";
import { readdir } from "fs/promises";

async function main() {
  const dir = path.join(process.cwd(), "data", "tz-cache", "0372200041826000050");
  const xlsx = (await readdir(dir)).find((f) => /\.xlsx$/i.test(f))!;
  const buffer = await readFile(path.join(dir, xlsx));
  const parsed = parseMedicalTextileOozXlsx(buffer)!;
  for (const b of parsed.productBlocks || []) {
    console.log("block", b.position, b.name, "chars", b.characteristics.length);
    for (const ch of b.characteristics) console.log(" ", ch.name, "=", ch.value);
  }
  console.log("total specs", parsed.productSpecs.length);
}

main().catch(console.error);

import { readFile, readdir } from "fs/promises";
import path from "path";
import {
  parseArticle33OozTable,
  parseWideOozTable,
  parseSimpleOozTable,
  parseDocxKtruTables,
  parseNoKtruWideOozTable,
} from "../src/lib/docxTableParser.ts";
import { parseOozDocxBuffer } from "../src/lib/tzDocumentParse.ts";
import { parseNmckExcelProducts } from "../src/lib/nmckExcelParser.ts";
import { parseEisKtruCatalogHtml } from "../src/lib/eisKtruCatalogParser.ts";
import AdmZip from "adm-zip";

function unwrapOffice(buffer) {
  const { unwrapOfficeArchive } = await import("../src/lib/officeText.ts");
  return unwrapOfficeArchive(buffer);
}

async function fetchEisHtml(reg, noticeType = "ea20") {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/common-info.html?regNumber=${reg}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    signal: AbortSignal.timeout(30000),
  });
  return res.text();
}

const ids = process.argv.slice(2);
if (ids.length === 0) ids.push("0301300017226000055", "0322300081426000146");

for (const externalId of ids) {
  console.log("\n" + "=".repeat(60));
  console.log("TENDER", externalId);
  console.log("=".repeat(60));

  const cacheDir = path.join(process.cwd(), "data", "tz-cache", externalId);
  let files = [];
  try {
    files = await readdir(cacheDir);
  } catch {
    console.log("no cache");
  }
  console.log("cache:", files.length, "files");

  for (const f of files) {
    if (!/\.(docx|xlsx|zip)$/i.test(f)) continue;
    let buf = await readFile(path.join(cacheDir, f));
    if (/\.zip$/i.test(f)) {
      const inner = unwrapOffice(buf);
      if (inner) {
        console.log("  unwrapped zip ->", inner.name, inner.format);
        buf = inner.buffer;
      } else {
        console.log("  zip unwrap failed");
        continue;
      }
    }
    console.log("\n---", f, "---");
    if (f.endsWith(".xlsx")) {
      const items = parseNmckExcelProducts(buf);
      console.log("nmck:", items.length, items.slice(0, 3));
      continue;
    }
    const parsed = parseOozDocxBuffer(buf);
    if (!parsed) {
      console.log("parseOozDocxBuffer: null");
      continue;
    }
    console.log("source:", parsed.source, "quality:", parsed.quality);
    console.log("products:", parsed.products);
    if (parsed.productBlocks?.length) {
      for (const b of parsed.productBlocks.slice(0, 5)) {
        console.log(` block pos=${b.position} code=${b.code} name=${b.name?.slice(0, 80)}`);
        console.log("  chars:", b.characteristics.slice(0, 6).map((c) => `${c.name}: ${c.value}`));
      }
    }
  }

  try {
    const html = await fetchEisHtml(externalId);
    const eis = parseEisKtruCatalogHtml(html);
    if (eis) {
      console.log("\nEIS catalog:", eis.products.length, "products");
      for (const b of eis.productBlocks?.slice(0, 5) || []) {
        console.log(` eis pos=${b.position} code=${b.code} name=${b.name?.slice(0, 80)}`);
      }
    } else {
      console.log("\nEIS catalog: null");
    }
  } catch (e) {
    console.log("EIS fetch error:", e.message);
  }
}

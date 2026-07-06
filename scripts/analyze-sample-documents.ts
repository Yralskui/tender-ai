import { copyFile, mkdir, readdir, readFile, rm } from "fs/promises";
import path from "path";
import { analyzeDocument } from "../src/lib/aiAnalysis";
import { parseRuFilenameCatalog } from "../src/lib/ruFilenameCatalog";
import { renderPdfPages } from "../src/lib/pdfRender";

const SAMPLES_DIR = path.join(process.cwd(), "data", "sample-documents");
const TEMP_DIR = path.join(process.cwd(), "public", "uploads", "_samples");

async function probePdfText(buffer: Buffer): Promise<number> {
  try {
    const mod = await import("pdf-parse");
    const PDFParse = (
      mod as {
        PDFParse: new (opts: { data: Buffer }) => {
          getText: () => Promise<{ text: string }>;
          destroy: () => Promise<void>;
        };
      }
    ).PDFParse;
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return (result.text || "").trim().length;
  } catch (e) {
    return -1;
  }
}

async function main() {
  await mkdir(TEMP_DIR, { recursive: true });

  let files: string[];
  try {
    files = (await readdir(SAMPLES_DIR)).filter((f) => /\.pdf$/i.test(f));
  } catch {
    console.log("Нет папки", SAMPLES_DIR);
    return;
  }

  console.log(`PDF: ${files.length}\n`);

  for (const name of files.sort()) {
    const src = path.join(SAMPLES_DIR, name);
    const buffer = await readFile(src);
    const textLen = await probePdfText(buffer);
    const fromName = parseRuFilenameCatalog(name);

    let pages = 0;
    try {
      const rendered = await renderPdfPages(src, 24);
      pages = rendered.length;
    } catch (e) {
      console.log("render error:", e);
    }

    const safe = `_sample_${files.indexOf(name)}.pdf`;
    const dest = path.join(TEMP_DIR, safe);
    await copyFile(src, dest);

    console.log("=".repeat(72));
    console.log(name);
    console.log(`  text:${textLen}  pages_rendered:${pages}  from_name:${fromName.length}`);

    try {
      const quick = await analyzeDocument(`/uploads/_samples/${safe}`, name, "medical_ru", { mode: "quick" });
      console.log(`  quick: ${quick.productCount} pos, warn=${quick.warning?.slice(0, 60) || "—"}`);

      const full = await analyzeDocument(`/uploads/_samples/${safe}`, name, "medical_ru", { mode: "full" });
      console.log(`  full:  ${full.productCount} pos, conf=${full.confidence}`);
      if (full.warning) console.log(`  warn:  ${full.warning.slice(0, 120)}`);
      if (full.products.length) {
        for (const p of full.products.slice(0, 8)) console.log(`    • ${p.slice(0, 90)}`);
        if (full.products.length > 8) console.log(`    … +${full.products.length - 8}`);
      }
      const withDims = (full.catalogItems || []).filter(
        (i) => i.dimensions.length || i.dimensions.width || i.dimensions.height
      ).length;
      console.log(`  catalogItems: ${full.catalogItems?.length ?? 0}, with_dims: ${withDims}`);
    } catch (e) {
      console.log("  ERROR:", e);
    }
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

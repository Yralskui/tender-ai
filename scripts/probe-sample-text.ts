import { readFile } from "fs/promises";
import path from "path";
import { extractRuAnnexProducts } from "../src/lib/ruAnnexParser";

async function getText(filePath: string): Promise<string | null> {
  const mod = await import("pdf-parse");
  const PDFParse = (mod as { PDFParse: new (o: { data: Buffer }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } }).PDFParse;
  const p = new PDFParse({ data: await readFile(filePath) });
  const r = await p.getText();
  await p.destroy();
  const t = r.text?.trim() || "";
  return t || null;
}

async function main() {
  const dir = path.join(process.cwd(), "data", "sample-documents");
  const names = [
    "РУ №РЗН 2025-25693 от 26.06.2025 Комплекты белья стер (прост, плен, пелен, чех).pdf",
    "РУ №РЗН 2025-25657 от 17.06.2025 Комплекты одежды стер.pdf",
    "РУ  №РЗН 2012-13821 от 26.05.2025.pdf",
  ];
  for (const name of names) {
    const text = await getText(path.join(dir, name));
    console.log("\n===", name, "===");
    const medical = /рзн|фср|росздрав|медицинск/i.test(text || "");
    console.log("len:", text?.length, "medical:", medical);
    console.log("annex:", extractRuAnnexProducts(text || "").length);
    console.log("sample:", text?.slice(0, 400).replace(/\s+/g, " "));
  }
}

main();

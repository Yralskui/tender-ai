import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";

async function loadPDFParse() {
  const mod = await import("pdf-parse");
  const PDFParse = (mod as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } }).PDFParse;
  return PDFParse;
}

async function pdfTextLen(fileUrl: string): Promise<{ len: number; sample: string; pages?: number }> {
  const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));
  try {
    const buffer = await readFile(filePath);
    const PDFParse = await loadPDFParse();
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text?.trim() || "";
    return { len: text.length, sample: text.slice(0, 100).replace(/\s+/g, " ") };
  } catch (e) {
    return { len: -1, sample: String(e) };
  }
}

async function main() {
  const docs = await prisma.document.findMany({ orderBy: { createdAt: "desc" } });
  for (const d of docs) {
    const ex = JSON.parse(d.extractedData || "{}");
    const pdf = await pdfTextLen(d.fileUrl);
    const cat = Array.isArray(ex.catalogItems) ? ex.catalogItems.length : 0;
    const prod = Array.isArray(ex.products) ? ex.products.length : 0;
    console.log(
      [
        d.name.slice(0, 55).padEnd(55),
        `text:${String(pdf.len).padStart(5)}`,
        `prod:${String(prod).padStart(3)}`,
        `cat:${String(cat).padStart(3)}`,
        d.status,
        ex.warning ? "WARN" : "ok",
      ].join(" | ")
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

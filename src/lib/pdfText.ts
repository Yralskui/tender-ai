/**
 * Извлечение текста из PDF (буфер) — общая утилита для ТЗ и AI-анализа.
 */

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const mod = await import("pdf-parse");
    const PDFParse = (mod as { PDFParse: new (opts: { data: Buffer }) => PdfParser }).PDFParse;
    if (!PDFParse) return null;

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text?.trim() || "";
    return text.length > 0 ? text : null;
  } catch (e) {
    console.error("extractTextFromPdfBuffer:", e);
    return null;
  }
}

type PdfParser = {
  getText: () => Promise<{ text?: string }>;
  destroy: () => Promise<void>;
};

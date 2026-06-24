/**
 * Извлечение текста из DOC/DOCX/PDF/XLSX.
 */

import AdmZip from "adm-zip";
import { extractTextFromXlsxBuffer, isXlsxBuffer } from "@/lib/excelText";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function isZipArchive(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return ZIP_MAGIC.every((b, i) => buffer[i] === b);
}

function zipSubtype(buffer: Buffer): "docx" | "xlsx" | "unknown" {
  if (!isZipArchive(buffer)) return "unknown";
  try {
    const zip = new AdmZip(buffer);
    if (zip.getEntry("xl/workbook.xml")) return "xlsx";
    if (zip.getEntry("word/document.xml")) return "docx";
  } catch {
    // ignore
  }
  return "unknown";
}

function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTextFromDocxBuffer(buffer: Buffer): string | null {
  if (zipSubtype(buffer) !== "docx") return null;

  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return null;
    const xml = entry.getData().toString("utf8");
    const text = xmlToPlainText(xml);
    return text.length > 30 ? text : null;
  } catch (e) {
    console.error("extractTextFromDocxBuffer:", e);
    return null;
  }
}

export function detectOfficeFormat(buffer: Buffer): "docx" | "xlsx" | "pdf" | "unknown" {
  if (buffer.length >= 5 && buffer.slice(0, 5).toString() === "%PDF-") return "pdf";
  if (isXlsxBuffer(buffer)) return "xlsx";
  if (zipSubtype(buffer) === "docx") return "docx";
  return "unknown";
}

export interface UnwrappedOfficeFile {
  buffer: Buffer;
  format: "docx" | "xlsx";
  name: string;
}

function scoreNestedOfficeName(name: string): number {
  let score = 0;
  if (/описание|объект\s+закупки|техническ|характеристик|\bооз\b|\bтз\b/i.test(name)) score += 100;
  if (/нмцк|обоснован/i.test(name)) score += 90;
  if (/\.docx$/i.test(name)) score += 50;
  if (/\.xlsx$/i.test(name)) score += 40;
  return score;
}

/** Вложенный .docx/.xlsx внутри .zip (типично «Описание объекта закупки.docx.zip» на ТЭК-Торг). */
export function unwrapOfficeArchive(buffer: Buffer): UnwrappedOfficeFile | null {
  const direct = detectOfficeFormat(buffer);
  if (direct === "docx" || direct === "xlsx") {
    return { buffer, format: direct, name: "" };
  }
  if (!isZipArchive(buffer)) return null;

  try {
    const zip = new AdmZip(buffer);
    const entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory && /\.(docx|xlsx)$/i.test(e.entryName));

    entries.sort((a, b) => scoreNestedOfficeName(b.entryName) - scoreNestedOfficeName(a.entryName));

    for (const entry of entries) {
      const inner = entry.getData();
      const format = detectOfficeFormat(inner);
      if (format === "docx" || format === "xlsx") {
        const base = entry.entryName.split(/[/\\]/).pop() || entry.entryName;
        return { buffer: inner, format, name: base };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function extractTextFromOfficeBuffer(buffer: Buffer): Promise<{ text: string | null; format: string }> {
  const format = detectOfficeFormat(buffer);
  if (format === "pdf") {
    const { extractTextFromPdfBuffer } = await import("./pdfText");
    return { format: "pdf", text: await extractTextFromPdfBuffer(buffer) };
  }
  if (format === "xlsx") {
    return { format: "xlsx", text: extractTextFromXlsxBuffer(buffer) };
  }
  if (format === "docx") {
    return { format: "docx", text: extractTextFromDocxBuffer(buffer) };
  }
  return { format: "unknown", text: null };
}

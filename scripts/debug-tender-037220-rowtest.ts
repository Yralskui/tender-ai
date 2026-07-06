import { readFileSync } from "fs";
import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments";
import AdmZip from "adm-zip";
import { normalizeTzSpecText } from "../src/lib/textNormalize";
import { KTRU_CODE_RE } from "../src/lib/docxTableParser";

// We need to test isArticle33ProductRow - duplicate key logic from docxTableParser
import { looksLikeProductName, isMaterialCompositionText, isGenericProcurementTitle, isCharacteristicLabelAsName } from "../src/lib/tzSanitizer";
import { isKtruCode } from "../src/lib/textNormalize";

function extractRowCells(trXml: string): string[] {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
    .map((tc) => {
      const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      return texts.join("");
    })
    .map((cell) => normalizeTzSpecText(cell));
}

function cleanArticle33ProductName(raw: string): string {
  return normalizeTzSpecText(raw).replace(/обоснование\s+включения[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
}

function testRow(cells: string[]) {
  const position = (cells[0] || "").trim();
  if (!/^\d{1,3}$/.test(position)) return null;
  const joined = cells.join(" ");
  const codeMatch = (cells[1] || "").match(KTRU_CODE_RE) || joined.match(KTRU_CODE_RE);
  if (!codeMatch) return null;
  const nameCell = cleanArticle33ProductName((cells[2] || "").trim());
  const unitCell = (cells[3] || "").trim();
  const qtyCell = (cells[4] || "").trim();
  const hasUnit = /^(шт|штук)/i.test(unitCell);
  const hasQty = /^\d+$/.test(qtyCell);
  const branch1 = nameCell.length >= 8 && !isKtruCode(nameCell) && !isMaterialCompositionText(nameCell) && (hasUnit || hasQty);
  const candidates: string[] = [];
  for (const cell of cells) {
    const cleaned = cleanArticle33ProductName(cell);
    if (cleaned.length < 8) continue;
    if (looksLikeProductName(cleaned) || /^(простын|чехол|материал)/i.test(cleaned)) candidates.push(cleaned);
  }
  return { position, nameCell, unitCell, qtyCell, hasUnit, hasQty, branch1, candidates, looks: looksLikeProductName(nameCell) };
}

async function main() {
  const enriched = await enrichNoticeFromTzCache("0372200115726000039");
  const doc = enriched!.documents!.find((d) => /описание/i.test(d.name))!;
  const xml = new AdmZip(readFileSync(doc.cachedPath!)).getEntry("word/document.xml")!.getData().toString("utf8");
  for (const row of xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
    const cells = extractRowCells(row[1]);
    if (!/^(10|11|12|13|14)$/.test((cells[0] || "").trim())) continue;
    console.log(testRow(cells));
  }
  const t = "Материал для наложения гипсовой повязки";
  console.log("\nname checks:", {
    looks: looksLikeProductName(t),
    material: isMaterialCompositionText(t),
    generic: isGenericProcurementTitle(t),
    charLabel: isCharacteristicLabelAsName(t),
  });
}

main();

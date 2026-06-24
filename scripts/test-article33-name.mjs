import { readFileSync } from "fs";
import AdmZip from "adm-zip";
import { normalizeTzSpecText } from "../src/lib/textNormalize.ts";
import { looksLikeProductName } from "../src/lib/tzSanitizer.ts";

const KTRU_CODE_RE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d{8,})\b/;

function cleanArticle33ProductName(raw) {
  return normalizeTzSpecText(raw)
    .replace(/обоснование\s+включения[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRowCells(trXml) {
  return [...trXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
    .map((tc) => {
      const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      return texts.join("").replace(/\s+/g, " ").trim();
    })
    .map((cell) => normalizeTzSpecText(cell));
}

const buf = readFileSync(
  "data/tz-cache/0124200000626004062/0124200000626004062_Описание_объекта_закупки.docx"
);
const xml = new AdmZip(buf).getEntry("word/document.xml").getData().toString("utf8");
const rows = [...xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)];

for (const [i, r] of rows.entries()) {
  const cells = extractRowCells(r[1]);
  const joined = cells.join(" ");
  if (!KTRU_CODE_RE.test(joined)) continue;
  console.log("\n=== KTRU row", i, "cells:", cells.length);
  const candidates = [];
  for (const cell of cells) {
    const cleaned = cleanArticle33ProductName(cell);
    if (cleaned.length < 12) {
      console.log("skip short:", cleaned);
      continue;
    }
    if (/^КТРУ:/i.test(cleaned)) continue;
    if (/наименование\s+товара|характеристик|единица\s+измерения/i.test(cleaned)) {
      console.log("skip headerish:", cleaned.slice(0, 60));
      continue;
    }
    const ok =
      looksLikeProductName(cleaned) ||
      /^(простын|чехол|халат|салфет|маск|перчат|бахил|костюм)/i.test(cleaned);
    console.log("cell:", cleaned.slice(0, 80), "ok:", ok, "like:", looksLikeProductName(cleaned));
    if (ok) candidates.push(cleaned);
  }
  console.log("candidates:", candidates);
}

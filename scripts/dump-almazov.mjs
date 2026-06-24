import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";

const reg = "0372100049626001334";
const dir = path.join("data", "tz-cache", reg);

// DOCX - all tables
const docx = fs.readdirSync(dir).find((f) => f.includes("задание") || f.includes("_2_"));
if (docx) {
  const xml = new AdmZip(path.join(dir, docx)).getEntry("word/document.xml").getData().toString("utf8");
  const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)];
  console.log("DOCX tables:", tables.length);
  tables.forEach((tbl, ti) => {
    const rows = [...tbl[1].matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)];
    console.log(`\n--- Table ${ti + 1} (${rows.length} rows) ---`);
    for (const row of rows.slice(0, 12)) {
      const cells = [...row[1].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc) => {
        const texts = [...tc[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
        return texts.join("").replace(/\s+/g, " ").trim();
      });
      if (cells.some((c) => c)) console.log(cells.map((c) => c.slice(0, 80)).join(" | "));
    }
  });
}

// XLSX
const xlsx = fs.readdirSync(dir).find((f) => f.endsWith(".xlsx"));
if (xlsx) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, xlsx)), { type: "buffer", cellText: true });
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
    console.log(`\n=== XLSX sheet: ${sn} (${rows.length} rows) ===`);
    for (const row of rows.slice(0, 25)) {
      const cells = row.map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
      if (cells.some((c) => c)) console.log(cells.join(" | ").slice(0, 300));
    }
  }
}

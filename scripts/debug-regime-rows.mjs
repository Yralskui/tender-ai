import fs from "fs";

const html = fs.readFileSync("scripts/sample-regime.html", "utf8");
const start = html.search(/Применение национального режима/i);
const chunk = html.slice(start, start + 20000);
const rows = [...chunk.matchAll(/<tr class="table__row">([\s\S]*?)<\/tr>/gi)];
console.log("start", start, "chunkLen", chunk.length, "rows", rows.length);
for (const r of rows) {
  const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  console.log("cells", cells.length, cells);
}

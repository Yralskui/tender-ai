import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const reg = process.argv[2] || "0347200005726000009";
const noticeType = process.argv[3] || "zk20";
const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/documents.html?regNumber=${reg}`;

const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
});
const html = await res.text();

const docs = [];
const re = /([\s\S]{0,300})href="([^"]*filestore[^"]+)"([\s\S]{0,300})/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const ctx = (m[1] + m[3]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const nameMatch = ctx.match(/([А-Яа-яA-Za-z0-9][^<>"]{5,120}\.(?:pdf|docx?|xlsx?|rtf|zip))/i);
  const name = nameMatch ? nameMatch[1].trim() : ctx.slice(-80);
  docs.push({ url: m[2], name });
}

console.log("Found docs:", docs.length);
docs.forEach((d, i) => console.log(i, d.name, "\n ", d.url));

const tzDoc = docs.find((d) =>
  /описание объекта закупки|техническ|спецификац|тз\b|характеристик/i.test(d.name)
) || docs.find((d) => /\.docx?$/i.test(d.name));

if (!tzDoc) {
  console.log("No TZ doc found");
  process.exit(0);
}

console.log("\nDownloading:", tzDoc.name);
const dl = await fetch(tzDoc.url, {
  headers: { "User-Agent": "Mozilla/5.0" },
  redirect: "follow",
});
const buf = Buffer.from(await dl.arrayBuffer());
const outDir = path.join(process.cwd(), "scripts", "tmp-docs");
await mkdir(outDir, { recursive: true });
const ext = tzDoc.name.match(/\.(\w+)$/)?.[1] || "bin";
const outPath = path.join(outDir, `tz.${ext}`);
await writeFile(outPath, buf);
console.log("Saved", outPath, buf.length, "bytes");

if (ext === "docx" || ext === "doc") {
  const { default: AdmZip } = await import("adm-zip");
  const zip = new AdmZip(buf);
  const xml = zip.readAsText("word/document.xml");
  const text = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  console.log("\nDOCX text preview (first 2000 chars):\n");
  console.log(text.slice(0, 2000));
}

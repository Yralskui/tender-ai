const reg = process.argv[2] || "0347200005726000009";
const noticeType = process.argv[3] || "zk20";
const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/documents.html?regNumber=${reg}`;

const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
});
const html = await res.text();

// Find context around each filestore link
const re = /([\s\S]{0,400}href="([^"]*filestore[^"]+)"[\s\S]{0,400})/gi;
let m;
let i = 0;
while ((m = re.exec(html)) !== null && i < 10) {
  const ctx = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log(`\n--- DOC ${i} ---`);
  console.log("URL:", m[2]);
  console.log("CTX:", ctx.slice(0, 500));
  i++;
}

// Try attachment blocks
const blocks = [...html.matchAll(/attachment[^>]*>([\s\S]*?)<\/(?:div|tr)/gi)];
console.log("\nattachment blocks:", blocks.length);

// document title patterns
const titles = [...html.matchAll(/document__title[^>]*>([\s\S]*?)<\//gi)];
console.log("document__title:", titles.length);
titles.slice(0, 10).forEach((t) => console.log(" ", t[1].replace(/<[^>]+>/g, "").trim()));

const fileNames = [...html.matchAll(/fileName[^>]*>([\s\S]*?)<\//gi)];
console.log("fileName tags:", fileNames.length);
fileNames.slice(0, 10).forEach((t) => console.log(" ", t[1].replace(/<[^>]+>/g, "").trim()));

// Download one file and check content-type
const firstLink = html.match(/href="([^"]*filestore[^"]+)"/i)?.[1];
if (firstLink) {
  const dl = await fetch(firstLink, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  console.log("\nDownload test:", firstLink);
  console.log("status", dl.status, "type", dl.headers.get("content-type"), "len", dl.headers.get("content-length"));
  const buf = Buffer.from(await dl.arrayBuffer());
  console.log("actual bytes", buf.length, "magic", buf.slice(0, 8).toString("hex"));
  console.log("is PDF", buf.slice(0, 5).toString() === "%PDF-");
}

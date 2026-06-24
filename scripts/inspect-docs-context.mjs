const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/inspect-docs-context.mjs <documents.html url>");
  process.exit(1);
}

const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
const m = html.match(/href="([^"]*(?:filestore|download)[^"]+)"/i);
if (!m) {
  console.log("No filestore/download href found");
  process.exit(0);
}
const href = m[1];
const idx = html.indexOf(m[0]);
const start = Math.max(0, idx - 600);
const end = Math.min(html.length, idx + 600);
console.log("href:", href);
console.log("context:\n", html.slice(start, end));

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/inspect-docs-html.mjs <documents.html url>");
  process.exit(1);
}

const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
console.log("status", res.status, "len", html.length);
console.log("contains filestore", /filestore/i.test(html));
console.log("contains download", /download/i.test(html));

const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const interesting = hrefs.filter((h) => /filestore|download|file|attachment/i.test(h)).slice(0, 20);
console.log("interesting hrefs sample:", interesting);

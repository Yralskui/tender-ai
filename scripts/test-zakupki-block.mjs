import fs from "fs";

const url =
  "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=медицинские+изделия&morphology=on&order=date_pub+desc&pageNumber=1&recordsPerPage=3&fz44=on&af=on";

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html",
  },
});
const html = await res.text();

const parts = html.split("search-registry-entry-block");
console.log("parts", parts.length);
const block = parts[1] || "";
fs.writeFileSync("scripts/sample-block.html", block.slice(0, 15000));

// common class names in page
const classes = [...html.matchAll(/class="([^"]{5,60})"/g)].map((m) => m[1]);
const freq = {};
for (const c of classes) freq[c] = (freq[c] || 0) + 1;
console.log(
  Object.entries(freq)
    .filter(([k]) => k.includes("registry") || k.includes("price") || k.includes("customer") || k.includes("title"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
);

const url =
  "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=медицинские+изделия&morphology=on&order=date_pub+desc&pageNumber=1&recordsPerPage=5&fz44=on&af=on";

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html",
  },
});
const html = await res.text();
console.log("status", res.status, "len", html.length);

const linkRe = /href="(\/epz\/order\/notice\/[^"]+regNumber=(\d{19}))"/g;
const entries = [];
let m;
while ((m = linkRe.exec(html)) !== null) {
  if (!entries.find((e) => e.regNumber === m[2])) {
    entries.push({ href: m[1], regNumber: m[2] });
  }
}
console.log("unique entries", entries.length);
console.log(entries.slice(0, 3));

// Try gosplan
for (const apiUrl of [
  "https://v2.gosplan.info/purchases?limit=2",
  "https://api.gosplan.info/purchases?limit=2",
  "https://gosplan.info/api/purchases?limit=2",
]) {
  try {
    const r = await fetch(apiUrl);
    console.log(apiUrl, r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.log(apiUrl, "err", e.message);
  }
}

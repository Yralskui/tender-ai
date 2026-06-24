const reg = "0347200005726000009";
const urls = [
  `https://zakupki.gov.ru/epz/order/notice/zk20/view/common-info.html?regNumber=${reg}`,
  `https://zakupki.gov.ru/epz/order/notice/zk20/view/documents.html?regNumber=${reg}`,
];

for (const url of urls) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await res.text();
  console.log("\n===", url, "status", res.status, "len", html.length);
  const keys = ["Электронная площадка", "площадк", "РУ", "регистрацион", "характеристик", "КТРУ", "Обеспечение", "productSpecs"];
  for (const k of keys) {
    const i = html.toLowerCase().indexOf(k.toLowerCase());
    if (i >= 0) console.log(k, ":", html.slice(i, i + 300).replace(/\s+/g, " "));
  }
  const docLinks = [...html.matchAll(/href="([^"]*\/filestore\/[^"]+)"/g)].slice(0, 5);
  console.log("filestore links", docLinks.length);
}

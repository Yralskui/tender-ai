import fs from "fs";

const reg = "0372100049626001334";
const url = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${reg}`;
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } });
const html = await res.text();
fs.writeFileSync("scripts/sample-almazov.html", html);

const ktruBlocks = [...html.matchAll(/14\.12\.30\.190[\s\S]{0,2000}/g)].slice(0, 2);
for (const b of ktruBlocks) console.log("KTRU block:", b[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500));

const docsUrl = `https://zakupki.gov.ru/epz/order/notice/ea20/view/documents.html?regNumber=${reg}`;
const docsRes = await fetch(docsUrl, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } });
const docsHtml = await docsRes.text();
const links = [...docsHtml.matchAll(/title="([^"]+)"[^>]*href="([^"]*filestore[^"]*)"/gi)].map((m) => m[1]);
console.log("\nDocuments:", links);

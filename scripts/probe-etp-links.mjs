import { readFileSync } from "fs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const url =
  "https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=0124200000626004062";
const res = await fetch(url, {
  headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
});
const html = await res.text();
const links = [...html.matchAll(/href="([^"]*rts-tender[^"]*)"/gi)].map((m) => m[1]);
console.log("rts links:", [...new Set(links)].slice(0, 15));
const etp = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)]
  .map((m) => m[1])
  .filter((u) => /rts-tender|roseltorg|sberbank-ast|tektorg|zakazrf/i.test(u));
console.log("etp links:", [...new Set(etp)].slice(0, 15));

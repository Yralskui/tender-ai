const reg = process.argv[2] || "0342300126626000060";
const noticeType = process.argv[3] || "zk20";
const pages = [
  "restrictions.html",
  "common-info.html",
  "lot-info.html",
  "documents.html",
];

for (const page of pages) {
  const url = `https://zakupki.gov.ru/epz/order/notice/${noticeType}/view/${page}?regNumber=${reg}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    const keys = ["национальн", "запрет", "ограничен", "иностран", "происхожд", "1875", "преимущество"];
    const hits = keys.filter((k) => html.toLowerCase().includes(k));
    const sections = [...html.matchAll(/class="section__title"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
    console.log(`\n=== ${page} (${res.status}, ${html.length} bytes) ===`);
    console.log("hits:", hits.join(", ") || "(none)");
    if (sections.length) console.log("sections:", sections.join(" | "));

    const regimeRows = [...html.matchAll(/<tr class="tableBlock__row">([\s\S]*?)<\/tr>/gi)]
      .map((r) =>
        [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
          .map((c) => c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
          .join(" | ")
      )
      .filter((row) => /запрет|огранич|преимущ|иностран|национальн|1875/i.test(row));
    for (const row of regimeRows.slice(0, 8)) console.log("ROW:", row.slice(0, 300));

    const regimeSection = html.match(
      /Применение национального режима[\s\S]{0,12000}?<\/section>/i
    );
    if (regimeSection) {
      console.log("REGIME SECTION snippet:", regimeSection[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200));
    }
  } catch (e) {
    console.log(page, "ERR", e.message);
  }
}

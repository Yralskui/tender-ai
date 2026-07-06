import { readFile } from "fs/promises";

async function main() {
  const html = await readFile("scripts/eis-snippet.html", "utf8");
  const cells: string[] = [];
  for (const m of html.matchAll(/<td class="tableBlock__col"[^>]*>([\s\S]*?)<\/td>/gi)) {
    cells.push(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }
  cells.forEach((c, i) => console.log(i, JSON.stringify(c.slice(0, 200))));
}

main().catch(console.error);

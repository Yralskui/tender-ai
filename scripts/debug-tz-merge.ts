import { fetchNoticeDetails } from "../src/lib/zakupkiImport";

async function main() {
  const id = process.argv[2] || "0368200011926000098";
  const htmlOnly = await fetchNoticeDetails(id, "ea20", { parseTzFiles: false });
  const withFile = await fetchNoticeDetails(id, "ea20", { parseTzFiles: true });

  console.log("=== HTML only ===");
  console.log("specs:", htmlOnly.productSpecs.length);
  htmlOnly.productSpecs.forEach((s, i) => console.log(`${i + 1}. ${s.slice(0, 140)}`));

  console.log("\n=== With file ===");
  console.log("specs:", withFile.productSpecs.length, "tzParsed:", withFile.tzParsedFromFile);
  withFile.productSpecs.forEach((s, i) => console.log(`${i + 1}. ${s.slice(0, 140)}`));
}

main().catch(console.error);

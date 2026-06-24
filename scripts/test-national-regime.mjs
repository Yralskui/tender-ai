import fs from "fs";
import {
  parseNationalRegimeFromNoticeHtml,
  analyzeNationalRegime,
} from "../src/lib/nationalRegime.ts";

const html = fs.readFileSync("scripts/sample-regime.html", "utf8");
const parsed = parseNationalRegimeFromNoticeHtml(html);
console.log("parsed", JSON.stringify(parsed, null, 2));

const analysis = analyzeNationalRegime(parsed, 63_000, [], [{ quantity: 1, name: "Комплекты" }]);
console.log("\nanalysis summary:", analysis.summary);
console.log("exemptionPossible:", analysis.exemptionPossible);
console.log("details:", analysis.details);

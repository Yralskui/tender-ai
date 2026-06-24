import { enrichNoticeFromTzCache } from "../src/lib/zakupkiDocuments.ts";

const r = await enrichNoticeFromTzCache("0124200000626004062", {});
console.log("tzVolumes:", r?.tzVolumes);
console.log("products:", r?.products);
console.log("spec count:", r?.productSpecs?.length);
console.log("ta:", r?.technicalAssignment);

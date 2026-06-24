import { enrichTenderById } from "../src/lib/tzEnrichmentJob";

const tenderId = process.argv[2] || "cmqg6dzy800043gviy651a1ai";
const result = await enrichTenderById(tenderId);
console.log(JSON.stringify(result, null, 2));

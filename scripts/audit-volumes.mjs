import { createRequire } from "module";

const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");

const stats = db
  .prepare(
    `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN json_array_length(json_extract(requirements, '$.tzVolumes')) > 0 THEN 1 ELSE 0 END) as withVol,
    SUM(CASE WHEN json_extract(requirements, '$.tzVolumes') IS NULL OR json_array_length(json_extract(requirements, '$.tzVolumes')) = 0 THEN 1 ELSE 0 END) as emptyVol
  FROM Tender WHERE requirements IS NOT NULL`
  )
  .get();
console.log("DB volume stats:", stats);

const empty = db
  .prepare(
    `SELECT externalId, json_extract(requirements, '$.importMode') as mode
     FROM Tender 
     WHERE (json_extract(requirements, '$.tzVolumes') IS NULL 
            OR json_array_length(json_extract(requirements, '$.tzVolumes')) = 0)
       AND json_array_length(json_extract(requirements, '$.productSpecs')) > 3
     LIMIT 12`
  )
  .all();
console.log("empty vol samples:", empty);

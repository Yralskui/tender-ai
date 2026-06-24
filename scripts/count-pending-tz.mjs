import { createRequire } from "module";
const require = createRequire(import.meta.url);
const db = require("better-sqlite3")("dev.db");
const pending = db
  .prepare(
    "SELECT COUNT(*) AS c FROM Tender WHERE status='active' AND requirements LIKE '%\"tzEnrichmentPending\":true%'"
  )
  .get();
const active = db.prepare("SELECT COUNT(*) AS c FROM Tender WHERE status='active'").get();
console.log({ pendingTz: pending.c, activeTenders: active.c });

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database("dev.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("tables:", tables.map((t) => t.name));
try {
  console.log("notifications:", db.prepare("SELECT id,type,title,emailSentAt FROM Notification ORDER BY createdAt DESC LIMIT 10").all());
} catch (e) {
  console.log("Notification table:", e.message);
}
try {
  console.log("prefs:", db.prepare("SELECT * FROM NotificationPreference").all());
} catch (e) {
  console.log("prefs:", e.message);
}
console.log("users:", db.prepare("SELECT id,email FROM User").all());

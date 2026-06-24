import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(root, "..", "dev.db"));

const exists = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='SupplierPriceItem'`)
  .get();

if (!exists) {
  db.exec(`
CREATE TABLE "SupplierPriceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "vendor" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'пара',
    "unitPrice" REAL NOT NULL,
    "unitPriceSterile" REAL,
    "priceBasis" TEXT NOT NULL DEFAULT 'за единицу',
    "thicknessUm" INTEGER,
    "densityGsm" INTEGER,
    "sizeText" TEXT,
    "colorText" TEXT,
    "materialText" TEXT,
    "packRatio" TEXT,
    "elasticType" TEXT,
    "categoryText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPriceItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPriceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierPriceItem_companyId_idx" ON "SupplierPriceItem"("companyId");
CREATE INDEX "SupplierPriceItem_documentId_idx" ON "SupplierPriceItem"("documentId");
`);
  console.log("Created SupplierPriceItem table");
} else {
  console.log("SupplierPriceItem already exists");
}

db.close();

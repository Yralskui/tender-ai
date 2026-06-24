-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "lengthMinMm" INTEGER,
    "lengthMaxMm" INTEGER,
    "widthMinMm" INTEGER,
    "widthMaxMm" INTEGER,
    "heightMinMm" INTEGER,
    "heightMaxMm" INTEGER,
    "unitSource" TEXT NOT NULL DEFAULT 'cm',
    "quantityText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogProduct_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CatalogProduct_companyId_idx" ON "CatalogProduct"("companyId");

-- CreateIndex
CREATE INDEX "CatalogProduct_documentId_idx" ON "CatalogProduct"("documentId");

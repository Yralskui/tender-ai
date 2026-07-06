import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

const t = await prisma.tender.count();
const eis = await prisma.tender.count({ where: { importedFromEis: true } });
const notEis = await prisma.tender.count({ where: { importedFromEis: false } });
const active = await prisma.tender.count({ where: { status: "active" } });
const match = await prisma.tenderMatch.count();
const matched = await prisma.tenderMatch.count({ where: { canParticipate: true } });
const docs = await prisma.document.count();
console.log(JSON.stringify({ t, eis, notEis, active, match, matched, docs }, null, 2));
await prisma.$disconnect();

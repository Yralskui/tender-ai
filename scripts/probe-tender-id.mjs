import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

const id = process.argv[2];
const t = await prisma.tender.findUnique({ where: { id } });
console.log(JSON.stringify(t, null, 2));
await prisma.$disconnect();

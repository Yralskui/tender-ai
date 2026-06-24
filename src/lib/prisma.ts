import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const dbPath = path.join(process.cwd(), "dev.db");
  const adapter = new PrismaBetterSqlite3({
    url: `file:${dbPath}`,
    timeout: 15000,
  });
  const client = new PrismaClient({ adapter });

  void client.$executeRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  void client.$executeRawUnsafe("PRAGMA busy_timeout=15000").catch(() => {});

  return client;
}

/** Увеличивать после prisma migrate / db push, чтобы dev hot-reload подхватил новые поля. */
const PRISMA_SCHEMA_GENERATION = 3;

/** После prisma db push / migrate dev-сервер держит старый клиент без новых моделей. */
function isPrismaClientStale(client: PrismaClient): boolean {
  const c = client as PrismaClient & {
    catalogProduct?: unknown;
    notification?: unknown;
    tenderLabel?: unknown;
    tenderLabelAssignment?: unknown;
    supplierPriceItem?: unknown;
  };
  if (
    !c.catalogProduct ||
    !c.notification ||
    !c.tenderLabel ||
    !c.tenderLabelAssignment ||
    !c.supplierPriceItem
  ) {
    return true;
  }
  return !("showInFeed" in Prisma.TenderMatchScalarFieldEnum);
}

function getPrismaClient(): PrismaClient {
  const global = globalForPrisma as typeof globalForPrisma & {
    prismaGeneration?: number;
  };
  if (
    !global.prisma ||
    global.prismaGeneration !== PRISMA_SCHEMA_GENERATION ||
    isPrismaClientStale(global.prisma)
  ) {
    global.prisma = createPrismaClient();
    global.prismaGeneration = PRISMA_SCHEMA_GENERATION;
  }
  return global.prisma;
}

/** Ленивый прокси — всегда актуальный клиент после hot-reload. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

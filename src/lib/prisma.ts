import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isPostgresUrl(url?: string): boolean {
  return !!url && /^postgres(ql)?:/i.test(url);
}

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL?.trim();

  if (isPostgresUrl(dbUrl)) {
    const pool = new pg.Pool({
      connectionString: dbUrl,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
    return new PrismaClient({ adapter: new PrismaPg(pool) });
  }

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
const PRISMA_SCHEMA_GENERATION = 9;

/** После prisma db push / migrate dev-сервер держит старый клиент без новых моделей. */
function isPrismaClientStale(client: PrismaClient): boolean {
  const c = client as PrismaClient & {
    catalogProduct?: unknown;
    notification?: unknown;
    tenderLabel?: unknown;
    tenderLabelAssignment?: unknown;
    supplierPriceItem?: unknown;
    promoCode?: unknown;
    promoCodeRedemption?: unknown;
  };
  if (
    !c.catalogProduct ||
    !c.notification ||
    !c.tenderLabel ||
    !c.tenderLabelAssignment ||
    !c.supplierPriceItem ||
    !c.promoCode ||
    !c.promoCodeRedemption
  ) {
    return true;
  }
  if (!("importedFromEis" in Prisma.TenderScalarFieldEnum)) {
    return true;
  }
  return !("emailVerificationToken" in Prisma.UserScalarFieldEnum);
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

export function databaseKind(): "postgresql" | "sqlite" {
  return isPostgresUrl(process.env.DATABASE_URL) ? "postgresql" : "sqlite";
}

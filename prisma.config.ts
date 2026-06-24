import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx ts-node --project tsconfig.json -e \"require('./prisma/seed.ts')\"",
  },
  datasource: {
    url: "file:./dev.db",
  },
});

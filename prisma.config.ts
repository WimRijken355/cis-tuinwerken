import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7-configuratie (vervangt de vroegere "prisma"-sleutel in package.json
 * en de url in schema.prisma). De CLI laadt .env via dotenv hierboven.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

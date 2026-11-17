import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "./config";

/**
 * Prisma-singleton (Prisma 7: client via driver-adapter voor node-postgres).
 *
 * In development herlaadt Next.js modules bij elke wijziging (HMR); zonder de
 * globalThis-cache zouden er tientallen databaseconnecties opgebouwd worden.
 * In productie is het gewoon één client per proces.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

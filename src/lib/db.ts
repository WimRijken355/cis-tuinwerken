import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AUDITED_MODELS, isUniqueConstraintError, recordIdOf, toCamelModel, toJsonSafe } from "./audit";
import { getAuditUserId } from "./audit-context";
import { config } from "./config";

/**
 * Prisma singleton (Prisma 7: client via a driver adapter for node-postgres),
 * extended with an audit trail: every create/update/upsert/delete(Many) on
 * an audited table (see AUDITED_MODELS in audit.ts) automatically writes an
 * AuditLog row — no separate call is needed per route.
 *
 * In development, Next.js reloads modules on every change (HMR); without the
 * globalThis cache this would open dozens of database connections.
 * In production it's simply one client per process.
 *
 * Important trade-off: the AuditLog insert is NOT guaranteed to run in the
 * same database transaction as the actual mutation (Prisma Client
 * Extensions don't offer a stable hook for that — tried both `this` inside
 * $allOperations and a $transaction override; neither gave reliable,
 * tx-bound access to other models). For a normal mutation the audit insert
 * happens right after the real write; only a process crash exactly between
 * those two statements could lose an audit row. For this app (not a
 * high-frequency/financial core system) that's an acceptable trade-off.
 */
type MutatingOperation =
  | "create"
  | "update"
  | "upsert"
  | "delete"
  | "createMany"
  | "updateMany"
  | "deleteMany";

const MUTATING_OPERATIONS = new Set<string>([
  "create",
  "update",
  "upsert",
  "delete",
  "createMany",
  "updateMany",
  "deleteMany",
]);

type Row = Record<string, unknown>;
type Delegate = {
  findUnique: (args: { where: unknown }) => Promise<Row | null>;
  findMany: (args: { where: unknown }) => Promise<Row[]>;
  create: (args: { data: unknown }) => Promise<Row>;
};

function createBaseClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config().DATABASE_URL });
  return new PrismaClient({ adapter });
}

function withAuditTrail(base: PrismaClient): PrismaClient {
  // Available to the hook below via closure (assigned before any query ever
  // runs). Typed as the base client: extensions don't change the shape of
  // the model delegates/$transaction.
  let db: PrismaClient;

  function delegateFor(model: string): Delegate {
    return (db as unknown as Record<string, Delegate>)[toCamelModel(model)];
  }

  // For the createMany loop below: `base` (not extended) instead of `db`,
  // otherwise each individual create() call would re-trigger the hook and
  // give every row a duplicate AuditLog entry.
  function baseDelegateFor(model: string): Delegate {
    return (base as unknown as Record<string, Delegate>)[toCamelModel(model)];
  }

  async function writeAuditLog(
    model: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: unknown,
    after: unknown,
  ) {
    const id = recordIdOf((after ?? before) as Row | null);
    if (id === null) return; // should never happen, but logging must never block the real action
    await db.auditLog.create({
      data: {
        tableName: model,
        recordId: id,
        action,
        userId: getAuditUserId(),
        before: before ? toJsonSafe(before) : undefined,
        after: after ? toJsonSafe(after) : undefined,
      },
    });
  }

  db = base.$extends({
    name: "audit-trail",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!model || !AUDITED_MODELS.has(model) || !MUTATING_OPERATIONS.has(operation)) {
            return query(args);
          }

          const delegate = delegateFor(model);
          const a = args as Row;

          switch (operation as MutatingOperation) {
            case "create": {
              const result = await query(args);
              await writeAuditLog(model, "CREATE", null, result);
              return result;
            }

            case "update":
            case "upsert": {
              const before = await delegate.findUnique({ where: a.where }).catch(() => null);
              const result = await query(args);
              await writeAuditLog(model, before ? "UPDATE" : "CREATE", before, result);
              return result;
            }

            case "delete": {
              // The deleted row IS the before-snapshot — no extra read needed.
              const result = await query(args);
              await writeAuditLog(model, "DELETE", result, null);
              return result;
            }

            case "createMany": {
              // Done row-by-row (instead of the bulk insert itself) so every
              // created row gets its own AuditLog entry + full snapshot.
              const rows = Array.isArray(a.data) ? a.data : a.data ? [a.data] : [];
              const skipDuplicates = Boolean(a.skipDuplicates);
              const rawDelegate = baseDelegateFor(model);
              let count = 0;
              for (const row of rows) {
                try {
                  const created = await rawDelegate.create({ data: row });
                  count++;
                  await writeAuditLog(model, "CREATE", null, created);
                } catch (error) {
                  if (skipDuplicates && isUniqueConstraintError(error)) continue;
                  throw error;
                }
              }
              return { count };
            }

            case "deleteMany": {
              const before = await delegate.findMany({ where: a.where });
              const result = await query(args);
              for (const row of before) {
                await writeAuditLog(model, "DELETE", row, null);
              }
              return result;
            }

            case "updateMany": {
              const before = await delegate.findMany({ where: a.where });
              const result = await query(args);
              if (before.length > 0) {
                const idField = "id" in before[0] ? "id" : "key";
                const ids = before.map((row) => row[idField]);
                const after = await delegate.findMany({ where: { [idField]: { in: ids } } });
                const afterById = new Map(after.map((row) => [String(row[idField]), row]));
                for (const row of before) {
                  await writeAuditLog(model, "UPDATE", row, afterById.get(String(row[idField])) ?? null);
                }
              }
              return result;
            }

            default:
              return query(args);
          }
        },
      },
    },
  }) as unknown as PrismaClient;

  return db;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? withAuditTrail(createBaseClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

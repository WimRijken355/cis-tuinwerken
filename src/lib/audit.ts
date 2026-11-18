/**
 * Building blocks for the audit extension in db.ts. Pulled into their own
 * file so the pure logic (no database needed) can be tested separately —
 * see audit.test.ts.
 */

/** Tables that get logged. Deliberately excluded: User, RecoveryCode,
 * TrustedDevice (would put password hashes/2FA secrets into the audit
 * trail) and AuditLog itself (no infinite recursion). */
export const AUDITED_MODELS = new Set([
  "Customer",
  "Todo",
  "RecurringTemplate",
  "RecurringWindow",
  "Appointment",
  "Completion",
  "LaborEntry",
  "Resource",
  "TodoResource",
  "TodoTask",
  "ChecklistItem",
  "LooseTodoPreset",
  "RecurringTemplateTask",
  "RecurringTemplateResource",
  "PriceListItem",
  "ExtraCharge",
  "Invoice",
  "Setting",
]);

/** Prisma model name (PascalCase) → client delegate property (camelCase). */
export function toCamelModel(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Primary key of a row as a string — works for `id` (Int) and `key` (String, Setting). */
export function recordIdOf(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const value = row.id ?? row.key;
  return value == null ? null : String(value);
}

/**
 * Makes a row safe for a Json column: Decimal/Date-like values are turned
 * into their plain-JSON form via JSON.stringify/parse (Decimal/Date
 * implement toJSON()), so Prisma never tries to serialize a class instance.
 */
export function toJsonSafe<T>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

/** Prisma error code P2002 = unique constraint — used to emulate `skipDuplicates`. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

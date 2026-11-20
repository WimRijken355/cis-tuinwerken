/**
 * Dev-only guard against a stale Prisma client.
 *
 * In development the Prisma client is cached on `globalThis` so it survives
 * Next.js hot reloads. After a schema change + `prisma generate`, the modules
 * reload but the cached client was built from the *old* generated code: it
 * rejects new fields (e.g. `Unknown argument customerId` on a create with a
 * new column) until the dev server is restarted. To prevent that, the cache
 * is keyed on a fingerprint of the generated schema and replaced on mismatch.
 */

/**
 * Fingerprint of the generated client's data model: every model with its
 * scalar fields, taken from the `Prisma.*ScalarFieldEnum` objects of the
 * generated namespace. Changes whenever a model or field is added/removed.
 */
export function schemaFingerprint(prismaNamespace: Record<string, unknown>): string {
  return Object.keys(prismaNamespace)
    .filter((key) => key.endsWith("ScalarFieldEnum"))
    .sort()
    .map((key) => {
      const fields = Object.keys(prismaNamespace[key] as Record<string, unknown>).sort();
      return `${key.replace(/ScalarFieldEnum$/, "")}(${fields.join(",")})`;
    })
    .join(";");
}

export interface CachedClient<T> {
  client: T;
  fingerprint: string;
}

/** May the cached client be reused for the currently generated schema? */
export function canReuseCachedClient<T>(cached: CachedClient<T> | undefined, fingerprint: string): cached is CachedClient<T> {
  return cached !== undefined && cached.fingerprint === fingerprint;
}

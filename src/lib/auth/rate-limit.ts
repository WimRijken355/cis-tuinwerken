/**
 * Eenvoudige in-memory rate limiter voor login-pogingen.
 * Volstaat omdat de app bewust op precies één instance draait
 * (zie commentaar in docker-compose.prod.yml).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minuten
const MAX_ATTEMPTS = 10;

const buckets = new Map<string, Bucket>();

/** Registreert een poging; geeft `false` terug zodra de limiet bereikt is. */
export function allowAttempt(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= MAX_ATTEMPTS;
}

/** Na een geslaagde login mag de teller weg (verkeerde-wachtwoord-historiek wissen). */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

// Hou de map klein: ruim verlopen buckets af en toe op.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, WINDOW_MS).unref?.();

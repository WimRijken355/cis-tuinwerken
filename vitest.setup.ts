import { config as loadDotenv } from "dotenv";

// Loads the real .env if it exists (local/dev) — so a db integration test
// (see db.audit.integration.test.ts) can run against the real dev database.
// If there's no .env (e.g. in CI), we fall back below to fake values so
// config.ts (envSchema) doesn't crash; that integration test then detects
// the database is unreachable and skips itself.
loadDotenv();

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "x".repeat(32);

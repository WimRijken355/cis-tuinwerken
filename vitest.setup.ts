// Nep-omgevingsvariabelen zodat src/lib/config.ts (envSchema) ook zonder
// een echte .env kan laden tijdens het testen.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "x".repeat(32);

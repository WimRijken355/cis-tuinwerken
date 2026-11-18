import { z } from "zod";

/**
 * Centrale env-parsing. Faalt hard bij het opstarten als een verplichte
 * variabele ontbreekt — liever een duidelijke fout dan een half werkende app.
 *
 * Variabelen voor latere fases (SMTP, EenvoudigFactureren) zijn optioneel;
 * de betreffende services controleren zelf en geven een duidelijke melding
 * wanneer ze gebruikt worden zonder configuratie.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL ontbreekt"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET moet minstens 32 tekens lang zijn"),

  /** Public base URL of the app (e.g. https://planning.example.be), used in
   *  links in e-mails (password reset). Falls back to the request origin. */
  APP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),

  // E-mail (Fase 3)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // EenvoudigFactureren (Fase 1+)
  EF_AUTH_MODE: z.enum(["apikey", "basic"]).default("apikey"),
  EF_API_KEY: z.string().optional(),
  EF_API_KEY_HEADER: z.string().default("X-API-Key"),
  EF_BASIC_USER: z.string().optional(),
  EF_BASIC_PASS: z.string().optional(),
  EF_ACCOUNT_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/** Geparste en gevalideerde omgevingsvariabelen (gecachet per proces). */
export function config(): AppConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Ongeldige configuratie (.env):\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

import { z } from "zod";

/** Gedeelde contracten voor de auth-endpoints (server valideert, client typt). */

export const loginSchema = z.object({
  username: z.string().min(1, "Gebruikersnaam is verplicht"),
  password: z.string().min(1, "Wachtwoord is verplicht"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpVerifySchema = z.object({
  /** 6-cijferige code uit de authenticator-app óf een herstelcode (XXXX-XXXX). */
  code: z.string().min(6, "Code is verplicht"),
  /** "Vertrouw dit toestel 30 dagen" — slaat de TOTP-stap daarna over. */
  trustDevice: z.boolean().optional().default(false),
  /** Vrij label voor in het overzicht van vertrouwde toestellen. */
  deviceLabel: z.string().max(100).optional(),
});
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

export const totpConfirmSchema = z.object({
  code: z.string().min(6, "Code is verplicht"),
});
export type TotpConfirmInput = z.infer<typeof totpConfirmSchema>;

/** Respons van POST /api/auth/login. */
export interface LoginResponse {
  ok: boolean;
  needsTotp?: boolean;
  needsTotpSetup?: boolean;
}

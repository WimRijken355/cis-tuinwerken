import crypto from "node:crypto";
import { z } from "zod";
import { sha256 } from "./totp";

/**
 * "Wachtwoord vergeten": pure building blocks (token, expiry, mail text,
 * contracts). The routes live in src/app/api/auth/password-reset/.
 *
 * Flow: the user asks a reset for a username or e-mail address → a one-time
 * link (valid RESET_TOKEN_TTL_MINUTES) is mailed to the user's address → on
 * the reset page a new password is chosen, which also resets 2FA (secret,
 * recovery codes, trusted devices): the next login goes through the 2FA setup.
 */

export const RESET_TOKEN_TTL_MINUTES = 60;

/** Reserved TLD used for placeholder addresses: never mail these. */
export function isDeliverableEmail(email: string): boolean {
  return !/\.invalid$/i.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Login / reset identifier: an e-mail address (contains "@") or a username. */
export function identifierWhere(identifier: string): { email: string } | { username: string } {
  const value = identifier.trim();
  return value.includes("@") ? { email: normalizeEmail(value) } : { username: value };
}

/** New random token: the raw value goes in the mail, only its hash is stored. */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function hashResetToken(token: string): string {
  return sha256(token);
}

export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

export function isResetTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date(),
): boolean {
  return Boolean(token && !token.usedAt && token.expiresAt > now);
}

export function resetLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetMail(username: string, link: string): { subject: string; text: string } {
  return {
    subject: "Tuinwerken Cis — wachtwoord opnieuw instellen",
    text: [
      `Hallo ${username},`,
      "",
      "Er werd gevraagd om je wachtwoord voor Tuinwerken Cis opnieuw in te stellen.",
      `Via deze link kies je een nieuw wachtwoord (geldig gedurende ${RESET_TOKEN_TTL_MINUTES} minuten, één keer bruikbaar):`,
      "",
      link,
      "",
      "Let op: daarmee wordt ook je tweestapsverificatie (2FA) gereset. Bij de volgende aanmelding stel je die opnieuw in.",
      "",
      "Heb je dit niet zelf gevraagd? Dan mag je deze mail negeren; er verandert niets.",
    ].join("\n"),
  };
}

/** Same answer whether or not the account exists (no user enumeration). */
export const RESET_REQUESTED_MESSAGE =
  "Als deze gebruiker bestaat, is er een e-mail verstuurd met een link om je wachtwoord opnieuw in te stellen.";
export const RESET_LINK_INVALID_MESSAGE =
  "Deze link is ongeldig of verlopen. Vraag een nieuwe aan via “Wachtwoord vergeten?”.";

export const passwordResetRequestSchema = z.object({
  identifier: z.string().trim().min(1, "Gebruikersnaam of e-mailadres is verplicht").max(200),
});

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(20, "Ongeldige link").max(200),
    password: z.string().min(10, "Wachtwoord moet minstens 10 tekens zijn").max(200),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "De wachtwoorden zijn niet gelijk",
    path: ["confirmPassword"],
  });

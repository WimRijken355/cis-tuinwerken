import crypto from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { config } from "../config";

/**
 * 2FA-hulpfuncties: TOTP (authenticator-app), herstelcodes en
 * "vertrouw dit toestel"-tokens.
 *
 * Het TOTP-geheim staat versleuteld in de database (AES-256-GCM) met een
 * sleutel die afgeleid is van SESSION_SECRET. Zo is een databasedump alleen
 * onvoldoende om geldige codes te genereren.
 */

const APP_NAME = "Tuinwerken Cis";

/** Sta één tijdsvenster (30s) klokafwijking toe tussen telefoon en server. */
const EPOCH_TOLERANCE_SECONDS = 30;

// ---------------------------------------------------------------------------
// Versleuteling van het TOTP-geheim
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  // scrypt met vaste salt: we hebben een deterministische sleutel nodig.
  return crypto.scryptSync(config().SESSION_SECRET, "tc-totp-secret", 32);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

/** Nieuw geheim + otpauth-URL voor de QR-code in de setup-stap. */
export function generateTotpSetup(username: string) {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: APP_NAME, label: username, secret });
  return { secret, otpauthUrl };
}

/** Controleert een 6-cijferige code tegen het (ontsleutelde) geheim. */
export async function verifyTotpCode(
  encryptedSecret: string,
  code: string,
): Promise<boolean> {
  try {
    return await verifyTotpCodeAgainstPlainSecret(decryptSecret(encryptedSecret), code);
  } catch {
    return false;
  }
}

/** Controleert een code rechtstreeks tegen een (nog niet opgeslagen) geheim — voor de setup-stap. */
export async function verifyTotpCodeAgainstPlainSecret(
  secret: string,
  code: string,
): Promise<boolean> {
  try {
    const result = await verify({
      secret,
      token: code.replace(/\s/g, ""),
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Herstelcodes
// ---------------------------------------------------------------------------

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Acht herstelcodes in het formaat XXXX-XXXX (zonder dubbelzinnige tekens).
 * De plaintext wordt eenmalig aan de gebruiker getoond; alleen de hash
 * wordt bewaard.
 */
export function generateRecoveryCodes(count = 8): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // geen I/O/0/1
  return Array.from({ length: count }, () => {
    const chars = Array.from(crypto.randomBytes(8))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

/** Normaliseert invoer van een herstelcode voor vergelijking met de hash. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
}

// ---------------------------------------------------------------------------
// Vertrouwde toestellen
// ---------------------------------------------------------------------------


/** Willekeurig token voor de cookie; in de database komt alleen de hash. */
export function generateTrustedDeviceToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

import { describe, expect, it } from "vitest";
import {
  createResetToken,
  hashResetToken,
  identifierWhere,
  isDeliverableEmail,
  isResetTokenUsable,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  RESET_TOKEN_TTL_MINUTES,
  resetLink,
  resetMail,
  resetTokenExpiry,
} from "./password-reset";

describe("password reset", () => {
  it("creates a random token and stores only its hash", () => {
    const a = createResetToken();
    const b = createResetToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.tokenHash).toBe(hashResetToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("a token is usable once and only until it expires", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const expiresAt = resetTokenExpiry(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(RESET_TOKEN_TTL_MINUTES * 60_000);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, now)).toBe(true);
    expect(isResetTokenUsable({ expiresAt, usedAt: now }, now)).toBe(false);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, expiresAt)).toBe(false);
    expect(isResetTokenUsable(null, now)).toBe(false);
  });

  it("looks up by e-mail (lowercased) when the identifier contains @, else by username", () => {
    expect(identifierWhere("  Wim.Rijken@Wirico.be ")).toEqual({ email: "wim.rijken@wirico.be" });
    expect(identifierWhere(" wim ")).toEqual({ username: "wim" });
  });

  it("never mails placeholder addresses", () => {
    expect(isDeliverableEmail("cis@geen-email.invalid")).toBe(false);
    expect(isDeliverableEmail("wim.rijken@wirico.be")).toBe(true);
  });

  it("builds the reset link and a mail that warns about the 2FA reset", () => {
    const link = resetLink("https://app.example.be/", "abc_DEF-123");
    expect(link).toBe("https://app.example.be/reset-password?token=abc_DEF-123");
    const mail = resetMail("wim", link);
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("2FA");
  });

  it("validates the request and confirm contracts", () => {
    expect(passwordResetRequestSchema.safeParse({ identifier: "  " }).success).toBe(false);
    const token = "x".repeat(43);
    expect(passwordResetConfirmSchema.safeParse({ token, password: "kort", confirmPassword: "kort" }).success).toBe(false);
    expect(
      passwordResetConfirmSchema.safeParse({ token, password: "lang-genoeg-1", confirmPassword: "anders-genoeg" }).success,
    ).toBe(false);
    expect(
      passwordResetConfirmSchema.safeParse({ token, password: "lang-genoeg-1", confirmPassword: "lang-genoeg-1" }).success,
    ).toBe(true);
  });
});

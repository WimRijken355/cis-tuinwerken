import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  sha256,
  verifyTotpCodeAgainstPlainSecret,
} from "./totp";

describe("encryptSecret / decryptSecret", () => {
  it("geeft na encrypt+decrypt de originele waarde terug", () => {
    const encrypted = encryptSecret("mijn-geheim-123");
    expect(decryptSecret(encrypted)).toBe("mijn-geheim-123");
  });

  it("produceert telkens een andere ciphertekst (willekeurige iv)", () => {
    const a = encryptSecret("zelfde-geheim");
    const b = encryptSecret("zelfde-geheim");
    expect(a).not.toBe(b);
  });
});

describe("verifyTotpCodeAgainstPlainSecret", () => {
  it("wijst een duidelijk ongeldige code af", async () => {
    expect(await verifyTotpCodeAgainstPlainSecret("JBSWY3DPEHPK3PXP", "000000")).toBe(false);
  });

  it("geeft false (geen exception) bij een kapot geheim", async () => {
    expect(await verifyTotpCodeAgainstPlainSecret("", "123456")).toBe(false);
  });
});

describe("generateRecoveryCodes", () => {
  it("genereert standaard 8 unieke codes in het formaat XXXX-XXXX", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });
});

describe("normalizeRecoveryCode", () => {
  it("zet kleine letters, spaties en streepjes naar het standaardformaat", () => {
    expect(normalizeRecoveryCode("ab3d 2f4g")).toBe("AB3D-2F4G");
  });

  it("is idempotent voor een reeds correct geformatteerde code", () => {
    expect(normalizeRecoveryCode("AB3D-2F4G")).toBe("AB3D-2F4G");
  });
});

describe("sha256", () => {
  it("is deterministisch voor dezelfde invoer", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
  });

  it("geeft een 64-tekens hex-string", () => {
    expect(sha256("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});

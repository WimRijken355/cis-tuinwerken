import { describe, expect, it } from "vitest";
import { createUserSchema, toUserDto, updateUserSchema } from "./users";

const valid = { username: "jan", email: "jan@example.be", password: "wachtwoord123", role: "SUPERUSER" };

describe("createUserSchema", () => {
  it("aanvaardt een geldige invoer en zet het e-mailadres in kleine letters", () => {
    const result = createUserSchema.parse({ ...valid, email: "  Jan@Example.BE " });
    expect(result).toEqual({ ...valid, email: "jan@example.be" });
  });

  it("e-mail is verplicht en moet geldig zijn", () => {
    const { email: _omit, ...withoutEmail } = valid;
    expect(() => createUserSchema.parse(withoutEmail)).toThrow();
    expect(() => createUserSchema.parse({ ...valid, email: "geen-email" })).toThrow();
  });

  it("weigert een @ in de gebruikersnaam (gereserveerd voor aanmelden met e-mail)", () => {
    expect(() => createUserSchema.parse({ ...valid, username: "jan@x" })).toThrow();
  });

  it("weigert een te kort wachtwoord", () => {
    expect(() => createUserSchema.parse({ ...valid, password: "kort" })).toThrow();
  });

  it("weigert een te korte gebruikersnaam", () => {
    expect(() => createUserSchema.parse({ ...valid, username: "ab" })).toThrow();
  });

  it("weigert een ongeldige rol", () => {
    expect(() => createUserSchema.parse({ ...valid, role: "SUPERADMIN" })).toThrow();
  });
});

describe("updateUserSchema", () => {
  it("aanvaardt enkel ADMIN of SUPERUSER", () => {
    expect(updateUserSchema.parse({ role: "ADMIN" }).role).toBe("ADMIN");
    expect(() => updateUserSchema.parse({ role: "GUEST" })).toThrow();
  });

  it("past rol en/of e-mail aan; weggelaten velden blijven ongemoeid", () => {
    expect(updateUserSchema.parse({ email: "Cis@Example.be" })).toEqual({ email: "cis@example.be" });
    expect(() => updateUserSchema.parse({})).toThrow();
    expect(() => updateUserSchema.parse({ email: "fout" })).toThrow();
  });
});

describe("toUserDto", () => {
  it("zet Date-velden om naar ISO-strings en geeft het e-mailadres mee", () => {
    const dto = toUserDto({
      id: 1,
      username: "jan",
      email: "jan@example.be",
      role: "ADMIN",
      totpEnabledAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    });
    expect(dto.email).toBe("jan@example.be");
    expect(dto.totpEnabledAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.createdAt).toBe("2025-12-01T00:00:00.000Z");
  });

  it("geeft null voor totpEnabledAt als 2FA nog niet ingesteld is", () => {
    const dto = toUserDto({
      id: 1,
      username: "jan",
      email: "jan@example.be",
      role: "SUPERUSER",
      totpEnabledAt: null,
      createdAt: new Date(),
    });
    expect(dto.totpEnabledAt).toBeNull();
  });
});

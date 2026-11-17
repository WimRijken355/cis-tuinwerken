import { describe, expect, it } from "vitest";
import { createUserSchema, toUserDto, updateUserRoleSchema } from "./users";

describe("createUserSchema", () => {
  it("aanvaardt een geldige invoer", () => {
    const result = createUserSchema.parse({
      username: "jan",
      password: "wachtwoord123",
      role: "SUPERUSER",
    });
    expect(result).toEqual({ username: "jan", password: "wachtwoord123", role: "SUPERUSER" });
  });

  it("weigert een te kort wachtwoord", () => {
    expect(() =>
      createUserSchema.parse({ username: "jan", password: "kort", role: "ADMIN" }),
    ).toThrow();
  });

  it("weigert een te korte gebruikersnaam", () => {
    expect(() =>
      createUserSchema.parse({ username: "ab", password: "wachtwoord123", role: "ADMIN" }),
    ).toThrow();
  });

  it("weigert een ongeldige rol", () => {
    expect(() =>
      createUserSchema.parse({ username: "jan", password: "wachtwoord123", role: "SUPERADMIN" }),
    ).toThrow();
  });
});

describe("updateUserRoleSchema", () => {
  it("aanvaardt enkel ADMIN of SUPERUSER", () => {
    expect(updateUserRoleSchema.parse({ role: "ADMIN" }).role).toBe("ADMIN");
    expect(() => updateUserRoleSchema.parse({ role: "GUEST" })).toThrow();
  });
});

describe("toUserDto", () => {
  it("zet Date-velden om naar ISO-strings", () => {
    const dto = toUserDto({
      id: 1,
      username: "jan",
      role: "ADMIN",
      totpEnabledAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    });
    expect(dto.totpEnabledAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.createdAt).toBe("2025-12-01T00:00:00.000Z");
  });

  it("geeft null voor totpEnabledAt als 2FA nog niet ingesteld is", () => {
    const dto = toUserDto({
      id: 1,
      username: "jan",
      role: "SUPERUSER",
      totpEnabledAt: null,
      createdAt: new Date(),
    });
    expect(dto.totpEnabledAt).toBeNull();
  });
});

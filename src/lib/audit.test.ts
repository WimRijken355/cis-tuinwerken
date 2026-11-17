import { describe, expect, it } from "vitest";
import {
  AUDITED_MODELS,
  isUniqueConstraintError,
  recordIdOf,
  toCamelModel,
  toJsonSafe,
} from "./audit";

describe("AUDITED_MODELS", () => {
  it("bevat de zakelijke tabellen", () => {
    expect(AUDITED_MODELS.has("Customer")).toBe(true);
    expect(AUDITED_MODELS.has("Invoice")).toBe(true);
    expect(AUDITED_MODELS.has("Setting")).toBe(true);
  });

  it("sluit security-gevoelige en interne logtabellen bewust uit", () => {
    expect(AUDITED_MODELS.has("User")).toBe(false);
    expect(AUDITED_MODELS.has("RecoveryCode")).toBe(false);
    expect(AUDITED_MODELS.has("TrustedDevice")).toBe(false);
    expect(AUDITED_MODELS.has("EmailLog")).toBe(false);
    expect(AUDITED_MODELS.has("AuditLog")).toBe(false);
  });
});

describe("toCamelModel", () => {
  it("zet de Prisma-modelnaam om naar de client-delegate-property", () => {
    expect(toCamelModel("Customer")).toBe("customer");
    expect(toCamelModel("RecurringWindow")).toBe("recurringWindow");
    expect(toCamelModel("PriceListItem")).toBe("priceListItem");
  });
});

describe("recordIdOf", () => {
  it("geeft de id als string voor een rij met een Int-primary key", () => {
    expect(recordIdOf({ id: 42, name: "X" })).toBe("42");
  });

  it("valt terug op key voor een rij met een String-primary key (Setting)", () => {
    expect(recordIdOf({ key: "own_hourly_rate", value: 45 })).toBe("own_hourly_rate");
  });

  it("geeft null voor een lege/ontbrekende rij", () => {
    expect(recordIdOf(null)).toBeNull();
    expect(recordIdOf(undefined)).toBeNull();
  });
});

describe("toJsonSafe", () => {
  it("zet een Decimal-achtige waarde (met toJSON) om naar zijn string-vorm", () => {
    const decimalLike = { toJSON: () => "10.50" };
    const result = toJsonSafe({ unitPrice: decimalLike });
    expect(result).toEqual({ unitPrice: "10.50" });
  });

  it("laat gewone waarden ongemoeid", () => {
    expect(toJsonSafe({ id: 1, active: true, note: null })).toEqual({
      id: 1,
      active: true,
      note: null,
    });
  });
});

describe("isUniqueConstraintError", () => {
  it("herkent een Prisma P2002-fout", () => {
    expect(isUniqueConstraintError({ code: "P2002" })).toBe(true);
  });

  it("wijst andere fouten af", () => {
    expect(isUniqueConstraintError({ code: "P2025" })).toBe(false);
    expect(isUniqueConstraintError(new Error("iets anders"))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});

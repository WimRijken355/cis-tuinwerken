import { describe, expect, it } from "vitest";
import {
  buildCustomerWhere,
  customerInputSchema,
  customerListQuerySchema,
  formatAddress,
} from "./customers";

describe("customerInputSchema", () => {
  it("vult default countryCode en active in", () => {
    const result = customerInputSchema.parse({ name: "Jan Janssens" });
    expect(result.countryCode).toBe("BE");
    expect(result.active).toBe(true);
  });

  it("aanvaardt een leeg e-mailadres (optioneel veld)", () => {
    const result = customerInputSchema.parse({ name: "Jan", email: "" });
    expect(result.email).toBe("");
  });

  it("weigert een ongeldig e-mailadres", () => {
    expect(() => customerInputSchema.parse({ name: "Jan", email: "niet-geldig" })).toThrow();
  });

  it("weigert een lege naam", () => {
    expect(() => customerInputSchema.parse({ name: "  " })).toThrow();
  });
});

describe("formatAddress", () => {
  it("combineert straat, postcode en gemeente", () => {
    expect(formatAddress({ street: "Dorpsstraat 1", postalCode: "2000", city: "Antwerpen" })).toBe(
      "Dorpsstraat 1, 2000 Antwerpen",
    );
  });

  it("laat ontbrekende velden gewoon weg", () => {
    expect(formatAddress({ street: null, postalCode: "2000", city: null })).toBe("2000");
    expect(formatAddress({ street: null, postalCode: null, city: null })).toBe("");
  });
});

describe("customerListQuerySchema + buildCustomerWhere", () => {
  it("only active customers and no filters by default", () => {
    const q = customerListQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, pageSize: 25, includeInactive: false });
    expect(buildCustomerWhere(q)).toEqual({ active: true });
  });

  it("combines name, address, postal code and city filters (empty ones ignored)", () => {
    const q = customerListQuerySchema.parse({
      name: " jan ",
      address: "Kerkstraat",
      postalCode: "90",
      city: "",
      includeInactive: "1",
    });
    expect(buildCustomerWhere(q)).toEqual({
      name: { contains: "jan", mode: "insensitive" },
      street: { contains: "Kerkstraat", mode: "insensitive" },
      postalCode: { startsWith: "90", mode: "insensitive" },
    });
  });
});

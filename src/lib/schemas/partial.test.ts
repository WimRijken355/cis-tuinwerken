import { describe, expect, it } from "vitest";
import { priceListItemInputSchema } from "./catalog";
import { customerInputSchema } from "./customers";
import { partialWithoutDefaults } from "./partial";

describe("partialWithoutDefaults", () => {
  it("does not inject defaults for omitted fields (regression: PATCH reactivated customers)", () => {
    expect(partialWithoutDefaults(customerInputSchema).parse({ name: "Jan" })).toEqual({ name: "Jan" });
    expect(partialWithoutDefaults(priceListItemInputSchema).parse({ active: false })).toEqual({ active: false });
  });

  it("still validates the fields that are given", () => {
    expect(() => partialWithoutDefaults(customerInputSchema).parse({ email: "geen-mail" })).toThrow();
    expect(partialWithoutDefaults(customerInputSchema).parse({ active: false, countryCode: "NL" })).toEqual({
      active: false,
      countryCode: "NL",
    });
  });
});

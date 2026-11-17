import { describe, expect, it } from "vitest";
import { wouldRemoveLastAdmin } from "./users-guard";

describe("wouldRemoveLastAdmin", () => {
  it("blokkeert het degraderen van de laatste beheerder", () => {
    expect(
      wouldRemoveLastAdmin({ adminCount: 1, targetIsCurrentlyAdmin: true, targetWillBeAdmin: false }),
    ).toBe(true);
  });

  it("staat degraderen toe als er nog andere beheerders zijn", () => {
    expect(
      wouldRemoveLastAdmin({ adminCount: 2, targetIsCurrentlyAdmin: true, targetWillBeAdmin: false }),
    ).toBe(false);
  });

  it("is niet van toepassing als de rol niet verandert", () => {
    expect(
      wouldRemoveLastAdmin({ adminCount: 1, targetIsCurrentlyAdmin: true, targetWillBeAdmin: true }),
    ).toBe(false);
  });

  it("is niet van toepassing op een gebruiker die geen beheerder is", () => {
    expect(
      wouldRemoveLastAdmin({ adminCount: 1, targetIsCurrentlyAdmin: false, targetWillBeAdmin: false }),
    ).toBe(false);
  });

  it("staat promoveren naar beheerder altijd toe", () => {
    expect(
      wouldRemoveLastAdmin({ adminCount: 1, targetIsCurrentlyAdmin: false, targetWillBeAdmin: true }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseDecimal } from "./number";

describe("parseDecimal", () => {
  it("accepts a decimal comma or point and ignores spaces", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal(" 12.40 ")).toBe(12.4);
    expect(parseDecimal("7")).toBe(7);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("3,")).toBe(3);
  });

  it("gives NaN for empty or invalid input (instead of a silent 0)", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("1,2,3")).toBeNaN();
  });
});

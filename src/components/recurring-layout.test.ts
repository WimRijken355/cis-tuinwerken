import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Layout guard for the recurring-work form: the "Einde" options ("Eindigt op
 * [datum]", "Na [N] keer") must stay on one line each — the modal is the wide
 * variant and the option rows never wrap.
 */
const source = readFileSync(join(__dirname, "recurring-section.tsx"), "utf8");

describe("recurring form layout", () => {
  it("uses the wide modal", () => {
    expect(source).toMatch(/<Modal\s[^>]*\bwide\b/);
  });
  it("keeps every end option on one line", () => {
    const endOptions = source.match(/<label className="[^"]*">\s*<input type="radio" name="endMode"/g) ?? [];
    expect(endOptions).toHaveLength(3);
    for (const option of endOptions) expect(option).toContain("whitespace-nowrap");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Registration step "Artikels": the chosen articles come first, above the
 * search, so you see right away what was already added (explicit wish of the
 * user; v0.52.1 had briefly put the search on top).
 */
const source = readFileSync(
  join(__dirname, "..", "app", "(app)", "daily-planning", "[id]", "register", "page.tsx"),
  "utf8",
);

describe("registration articles step layout", () => {
  it("shows the chosen articles above 'Artikel toevoegen'", () => {
    const step = source.slice(source.indexOf("{step === 1 && ("), source.indexOf("{step === 2 && ("));
    const chosen = step.indexOf("Gekozen artikels");
    const search = step.indexOf('title="Artikel toevoegen (optioneel)"');
    expect(chosen).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(-1);
    expect(chosen).toBeLessThan(search);
  });
});

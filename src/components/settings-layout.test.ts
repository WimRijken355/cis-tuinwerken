import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Layout guard for Instellingen → Algemeen: the fields of "Tarieven" and
 * "Planning" sit in a grid aligned on top, so a hint that wraps onto two
 * lines (e.g. under "Btw op arbeid") never pushes its input lower than the
 * others; the save button gets its own row.
 */
const source = readFileSync(join(__dirname, "..", "app", "(app)", "(settings)", "settings", "page.tsx"), "utf8");

function section(title: string): string {
  const start = source.indexOf(`<h2 className="font-semibold">${title}</h2>`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("</form>", start));
}

describe("settings page layout", () => {
  for (const title of ["Tarieven", "Planning"]) {
    it(`${title}: fields in a top-aligned grid, no bottom-aligned row`, () => {
      const form = section(title);
      expect(form).toContain("grid grid-cols-1 items-start gap-3 sm:grid-cols-3");
      expect(form).not.toContain("items-end");
    });
  }
});

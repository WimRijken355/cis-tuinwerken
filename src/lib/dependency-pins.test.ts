import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the major versions the app is built on, so a dependency update
 * (e.g. `npm audit fix --force`) cannot silently switch majors:
 * - TypeScript stays on 5.9: TS 7 breaks loading next.config.ts in Next 15.
 * - Next 15, Prisma 7 (audit fix --force proposes Next 16 / a Prisma 6 downgrade).
 * Checks both package.json (the range) and package-lock.json (what is installed).
 */
const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const installed = (name: string): string => lock.packages[`node_modules/${name}`]?.version ?? "";
const range = (name: string): string => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "";

describe("dependency pins", () => {
  it("TypeScript stays pinned on 5.9", () => {
    expect(range("typescript")).toBe("~5.9.0");
    expect(installed("typescript")).toMatch(/^5\.9\./);
  });

  it("Next stays on 15 and Prisma (client + CLI) on 7", () => {
    expect(installed("next")).toMatch(/^15\./);
    expect(installed("prisma")).toMatch(/^7\./);
    expect(installed("@prisma/client")).toMatch(/^7\./);
    expect(installed("prisma")).toBe(installed("@prisma/client"));
  });
});

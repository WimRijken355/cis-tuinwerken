import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/middleware";
import { LOGO_FULL_SRC, LOGO_MARK_SRC } from "@/lib/brand";
import manifest from "./manifest";

const publicFile = (src: string) => join(process.cwd(), "public", src);

describe("app icons & logo", () => {
  it("every manifest icon exists in /public", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    }
  });

  it("uses a dedicated (padded) maskable icon", () => {
    const icons = manifest().icons ?? [];
    const maskable = icons.find((i) => i.purpose === "maskable");
    const any = icons.filter((i) => i.purpose === "any").map((i) => i.src);
    expect(maskable).toBeDefined();
    expect(any).not.toContain(maskable!.src);
  });

  it("logo files exist and are excluded from the login redirect", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const src of [LOGO_FULL_SRC, LOGO_MARK_SRC]) {
      expect(existsSync(publicFile(src)), src).toBe(true);
      // The login page shows the logo before anyone is signed in.
      expect(matcher.test(src), src).toBe(false);
    }
    expect(matcher.test("/daily-planning")).toBe(true);
  });
});

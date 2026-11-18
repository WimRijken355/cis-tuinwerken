import { describe, expect, it } from "vitest";
import { isActivePath, isSettingsPath, MAIN_ITEMS, SETTINGS_ITEMS, START_PATH, visibleItems } from "./nav-items";

describe("navigation items", () => {
  it("opens the Dagplanning at startup, and that is a main menu item", () => {
    expect(START_PATH).toBe("/daily-planning");
    expect(MAIN_ITEMS.some((i) => i.href === START_PATH)).toBe(true);
  });

  it("groups artikels, resources, checklist, losse todo's, gebruikers and audittrail under Instellingen", () => {
    expect(SETTINGS_ITEMS.map((i) => i.href)).toEqual([
      "/settings",
      "/products",
      "/resources",
      "/checklist",
      "/loose-todo-presets",
      "/users",
      "/audit-log",
    ]);
    // ...and none of them is also a top-level item.
    const main = new Set(MAIN_ITEMS.map((i) => i.href));
    expect(SETTINGS_ITEMS.filter((i) => main.has(i.href))).toEqual([]);
  });

  it("recognises settings pages, including sub-paths", () => {
    expect(isSettingsPath("/checklist")).toBe(true);
    expect(isSettingsPath("/resources")).toBe(true);
    expect(isSettingsPath("/users/3")).toBe(true);
    expect(isSettingsPath("/audit-log")).toBe(true);
    expect(isSettingsPath("/customers")).toBe(false);
    expect(isSettingsPath("/settingsx")).toBe(false);
  });

  it("matches active paths on segment boundaries", () => {
    expect(isActivePath("/customers/12", "/customers")).toBe(true);
    expect(isActivePath("/customersx", "/customers")).toBe(false);
  });

  it("hides admin-only items for non-admins and desktop-only items on mobile", () => {
    expect(visibleItems(SETTINGS_ITEMS, false).map((i) => i.href)).not.toContain("/users");
    expect(visibleItems(SETTINGS_ITEMS, true).map((i) => i.href)).toContain("/users");
    expect(visibleItems(SETTINGS_ITEMS, false).map((i) => i.href)).not.toContain("/audit-log");
    expect(visibleItems(SETTINGS_ITEMS, true, false).map((i) => i.href)).not.toContain("/audit-log");
    expect(visibleItems(SETTINGS_ITEMS, true, true).map((i) => i.href)).toContain("/audit-log");
  });
});

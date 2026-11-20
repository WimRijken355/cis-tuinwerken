import { describe, expect, it } from "vitest";
import { ACTION_ICONS, ACTION_LABELS, toggleActiveAction } from "./action-icons";

describe("action icons", () => {
  it("every action has its own icon and a Dutch label", () => {
    const icons = Object.values(ACTION_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
    expect(ACTION_LABELS).toEqual({
      edit: "Bewerken",
      rename: "Hernoemen",
      deactivate: "Deactiveren",
      activate: "Activeren",
      delete: "Verwijderen",
    });
  });
  it("the (de)activate toggle depends on the current state", () => {
    expect(toggleActiveAction(true)).toBe("deactivate");
    expect(toggleActiveAction(false)).toBe("activate");
  });
});

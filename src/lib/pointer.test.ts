import { describe, expect, it, vi } from "vitest";
import { isBackdropDismiss, keepInputFocus } from "./pointer";

describe("keepInputFocus", () => {
  it("prevents the default mousedown so the search field keeps focus", () => {
    const preventDefault = vi.fn();
    keepInputFocus({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

describe("isBackdropDismiss", () => {
  const backdrop = {};
  const card = {};

  it("dismisses when the press started and ended on the backdrop", () => {
    expect(isBackdropDismiss(true, backdrop, backdrop)).toBe(true);
  });

  it("does not dismiss when the press started inside the modal (content shifted)", () => {
    expect(isBackdropDismiss(false, backdrop, backdrop)).toBe(false);
  });

  it("does not dismiss when the click ends on the modal content", () => {
    expect(isBackdropDismiss(true, card, backdrop)).toBe(false);
  });
});

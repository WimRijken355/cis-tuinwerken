import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowAttempt, clearAttempts } from "./rate-limit";

describe("allowAttempt", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("staat de eerste pogingen toe", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(allowAttempt(key)).toBe(true);
    }
  });

  it("blokkeert na het bereiken van het maximum binnen het venster", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) allowAttempt(key);
    expect(allowAttempt(key)).toBe(false);
  });

  it("clearAttempts reset de teller meteen", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) allowAttempt(key);
    expect(allowAttempt(key)).toBe(false);

    clearAttempts(key);
    expect(allowAttempt(key)).toBe(true);
  });

  it("gebruikt per key een eigen teller", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    for (let i = 0; i < 10; i++) allowAttempt(keyA);
    expect(allowAttempt(keyA)).toBe(false);
    expect(allowAttempt(keyB)).toBe(true);
  });
});

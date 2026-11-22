import { describe, expect, it } from "vitest";
import {
  SESSION_REFRESH_INTERVAL_MS,
  SESSION_TTL_SECONDS,
  shouldRefreshSession,
  TRUSTED_DEVICE_DAYS,
  trustedDeviceExpiry,
} from "./session-ttl";

describe("session TTL", () => {
  it("expires after 7 days", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("a trusted device is trusted 7 days from its last use", () => {
    const now = new Date(Date.UTC(2026, 10, 22, 12));
    expect(trustedDeviceExpiry(now).getTime() - now.getTime()).toBe(
      TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(TRUSTED_DEVICE_DAYS).toBe(7);
  });

  it("refreshes well within the TTL", () => {
    expect(SESSION_REFRESH_INTERVAL_MS).toBeLessThan(SESSION_TTL_SECONDS * 1000);
  });
});

describe("shouldRefreshSession", () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);

  it("refreshes a session that was never refreshed", () => {
    expect(shouldRefreshSession(undefined, now)).toBe(true);
  });

  it("does not refresh a recently refreshed session", () => {
    expect(shouldRefreshSession(now - 5 * 60 * 1000, now)).toBe(false);
  });

  it("refreshes once the interval has passed", () => {
    expect(shouldRefreshSession(now - SESSION_REFRESH_INTERVAL_MS, now)).toBe(true);
    expect(shouldRefreshSession(now - 3 * 24 * 60 * 60 * 1000, now)).toBe(true);
  });

  it("refreshes on a timestamp in the future or an invalid value", () => {
    expect(shouldRefreshSession(now + 60_000, now)).toBe(true);
    expect(shouldRefreshSession(Number.NaN, now)).toBe(true);
  });
});

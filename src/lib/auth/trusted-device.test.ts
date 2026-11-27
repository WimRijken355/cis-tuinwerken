import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    trustedDevice: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

const { forgetTrustedDevice, refreshTrustedDevice } = await import("./trusted-device");
const { sha256 } = await import("./totp");
const { TRUSTED_DEVICE_DAYS, SESSION_REFRESH_INTERVAL_MS } = await import("./session-ttl");

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(Date.UTC(2026, 10, 22, 12));

function device(
  overrides: Partial<{ userId: number; createdAt: Date; lastUsedAt: Date; expiresAt: Date }> = {},
) {
  return {
    id: 7,
    userId: 1,
    createdAt: new Date(now.getTime() - 20 * DAY),
    lastUsedAt: new Date(now.getTime() - 2 * DAY),
    expiresAt: new Date(now.getTime() + 5 * DAY),
    ...overrides,
  };
}

describe("refreshTrustedDevice", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("extends a used device to 7 days from now", async () => {
    findUnique.mockResolvedValue(device());
    const expiresAt = await refreshTrustedDevice(1, "token", now);
    expect(TRUSTED_DEVICE_DAYS).toBe(7);
    expect(expiresAt?.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { lastUsedAt: now, expiresAt },
    });
  });

  it("does nothing without a cookie", async () => {
    expect(await refreshTrustedDevice(1, undefined, now)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("never extends an expired device or one of another user", async () => {
    findUnique.mockResolvedValue(device({ expiresAt: new Date(now.getTime() - 1) }));
    expect(await refreshTrustedDevice(1, "token", now)).toBeNull();
    findUnique.mockResolvedValue(device({ userId: 2 }));
    expect(await refreshTrustedDevice(1, "token", now)).toBeNull();
    findUnique.mockResolvedValue(null);
    expect(await refreshTrustedDevice(1, "token", now)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("is throttled: a device used less than an hour ago is left alone", async () => {
    findUnique.mockResolvedValue(
      device({ lastUsedAt: new Date(now.getTime() - SESSION_REFRESH_INTERVAL_MS / 2) }),
    );
    expect(await refreshTrustedDevice(1, "token", now)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("stops extending at the 6-month hard limit", async () => {
    const { MAX_AUTH_AGE_DAYS } = await import("./session-ttl");
    const createdAt = new Date(now.getTime() - (MAX_AUTH_AGE_DAYS - 3) * DAY);
    const hardLimit = new Date(createdAt.getTime() + MAX_AUTH_AGE_DAYS * DAY);
    findUnique.mockResolvedValue(device({ createdAt, expiresAt: new Date(now.getTime() + 5 * DAY) }));
    expect((await refreshTrustedDevice(1, "token", now))?.getTime()).toBe(hardLimit.getTime());

    update.mockReset();
    findUnique.mockResolvedValue(device({ createdAt, expiresAt: hardLimit }));
    expect(await refreshTrustedDevice(1, "token", now)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("forgetTrustedDevice (afmelden)", () => {
  beforeEach(() => deleteMany.mockReset());

  it("removes this device's trust, so the next login asks for 2FA again", async () => {
    await forgetTrustedDevice("token");
    expect(deleteMany).toHaveBeenCalledWith({ where: { tokenHash: sha256("token") } });
  });

  it("does nothing without a trusted-device cookie", async () => {
    await forgetTrustedDevice(undefined);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

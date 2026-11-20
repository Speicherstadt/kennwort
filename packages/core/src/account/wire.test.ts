import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { AnnouncedWire, PairingKeyWire, PollWire, SessionWire, StoredWire } from "./wire.ts";

const b = (length: number, fill = 1) => encodeBytes(new Uint8Array(length).fill(fill));
const stored = {
  accountId: b(16),
  accountSalt: b(16, 2),
  keyBlock: b(40, 3),
  state: b(40, 4),
  stateCounter: 0,
  unlock: { passphrase: b(72, 5), recovery: b(72, 6) },
};

describe("StoredWire", () => {
  it("reads what GET /api/account/keys answers, as bytes", () => {
    const parsed = StoredWire.parse(stored);
    expect(parsed.accountId).toEqual(new Uint8Array(16).fill(1));
    expect(parsed.unlock.recovery).toEqual(new Uint8Array(72).fill(6));
    expect(parsed.stateCounter).toBe(0);
  });

  it("refuses an answer that lacks any part or has the wrong lengths", () => {
    for (const key of Object.keys(stored)) {
      const { [key as keyof typeof stored]: _, ...rest } = stored;
      expect(StoredWire.safeParse(rest).success).toBe(false);
    }
    for (const key of ["passphrase", "recovery"] as const) {
      const { [key]: _, ...unlock } = stored.unlock;
      expect(StoredWire.safeParse({ ...stored, unlock }).success).toBe(false);
    }
    expect(StoredWire.safeParse({ ...stored, accountId: b(15) }).success).toBe(false);
    expect(StoredWire.safeParse({ ...stored, stateCounter: -1 }).success).toBe(false);
  });
});

describe("SessionWire", () => {
  it("reads account ID and token, and refuses an empty or missing token", () => {
    expect(SessionWire.parse({ accountId: "a", token: "tok" })).toEqual({
      accountId: "a",
      token: "tok",
    });
    expect(SessionWire.safeParse({ accountId: "a", token: "" }).success).toBe(false);
    expect(SessionWire.safeParse({ token: "tok" }).success).toBe(false);
    expect(SessionWire.safeParse({ accountId: "a" }).success).toBe(false);
  });
});

describe("the pairing answers", () => {
  it("read what the server sends and refuse what it must not", () => {
    expect(AnnouncedWire.parse({ id: "i", pollToken: "t" })).toEqual({ id: "i", pollToken: "t" });
    for (const bad of [
      { id: "", pollToken: "t" },
      { id: "i", pollToken: "" },
      { id: "i" },
      { pollToken: "t" },
    ])
      expect(AnnouncedWire.safeParse(bad).success).toBe(false);
    expect(PollWire.parse({ state: "waiting" })).toEqual({ state: "waiting" });
    expect(PollWire.parse({ state: "package", package: b(3) })).toEqual({
      state: "package",
      package: new Uint8Array(3).fill(1),
    });
    expect(PollWire.parse({ state: "confirmed", package: b(3), token: "t" })).toMatchObject({
      token: "t",
    });
    for (const bad of [
      { state: "confirmed", package: b(3), token: "" },
      { state: "confirmed", package: b(3) },
      { state: "package" },
      { state: "other" },
    ])
      expect(PollWire.safeParse(bad).success).toBe(false);
    expect(PairingKeyWire.parse({ publicKey: b(1216) }).publicKey).toHaveLength(1216);
    expect(PairingKeyWire.safeParse({ publicKey: b(1215) }).success).toBe(false);
  });
});

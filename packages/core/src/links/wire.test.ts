import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import {
  LINK_EXPIRIES,
  LINK_LIMITS,
  LinkCreate,
  LinkCreated,
  LinkFetched,
  LinkIdText,
  LinkList,
  LinkSummary,
} from "./wire.ts";

// K-601: what goes between client and server for a one-time link
const HOUR = 3_600_000;
const id = encodeBytes(new Uint8Array(16).fill(7));
const ciphertext = (length: number) => encodeBytes(new Uint8Array(length).fill(1));
const create = (over: Record<string, unknown> = {}) =>
  LinkCreate.safeParse({ ciphertext: ciphertext(100), expiresInMs: HOUR, maxFetches: 2, ...over });

describe("limits", () => {
  it("are seven days at most, five minutes at least, 1 to 10 fetches and 64 KiB, frozen", () => {
    expect(LINK_LIMITS).toEqual({
      maxExpiryMs: 7 * 24 * HOUR,
      minExpiryMs: 5 * 60_000,
      minFetches: 1,
      maxFetches: 10,
      maxBytes: 65_536,
    });
    expect(Object.isFrozen(LINK_LIMITS)).toBe(true);
  });

  it("offer an hour, a day, three days and seven days, all within the limits", () => {
    expect(LINK_EXPIRIES).toEqual([HOUR, 24 * HOUR, 72 * HOUR, 168 * HOUR]);
    expect(Object.isFrozen(LINK_EXPIRIES)).toBe(true);
    for (const ms of LINK_EXPIRIES) expect(create({ expiresInMs: ms }).success).toBe(true);
  });
});

describe("LinkCreate", () => {
  it("takes a ciphertext, an expiry and a number of fetches within the limits", () => {
    const parsed = create();
    expect(parsed.success && parsed.data).toEqual({
      ciphertext: new Uint8Array(100).fill(1),
      expiresInMs: HOUR,
      maxFetches: 2,
    });
    expect(create({ ciphertext: ciphertext(65_536) }).success).toBe(true);
    expect(create({ expiresInMs: 300_000, maxFetches: 1 }).success).toBe(true);
    expect(create({ expiresInMs: 7 * 24 * HOUR, maxFetches: 10 }).success).toBe(true);
  });

  it("refuses an empty or too large ciphertext, saying why", () => {
    for (const length of [0, 65_537]) {
      const parsed = create({ ciphertext: ciphertext(length) });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe("size");
    }
    expect(create({ ciphertext: "not base64!" }).success).toBe(false);
  });

  it("refuses an expiry or number of fetches outside the limits, or not a whole number", () => {
    for (const expiresInMs of [299_999, 7 * 24 * HOUR + 1, HOUR + 0.5, "3600000"])
      expect(create({ expiresInMs }).success).toBe(false);
    for (const maxFetches of [0, 11, 1.5, -1, "2"])
      expect(create({ maxFetches }).success).toBe(false);
  });
});

describe("IDs", () => {
  it("are 16 bytes in canonical base64url", () => {
    expect(LinkIdText.safeParse(id).success).toBe(true);
    for (const other of ["", id.slice(1), `${id}A`, `${id.slice(0, 21)}B`, `x${id}`])
      expect(LinkIdText.safeParse(other).success).toBe(false);
  });

  it("name a new link, its fetch ID and when it expires", () => {
    const made = { id, fetchId: id, expiresAt: 5 };
    expect(LinkCreated.parse(made)).toEqual(made);
    expect(LinkCreated.safeParse({ ...made, fetchId: "kurz" }).success).toBe(false);
    expect(LinkCreated.safeParse({ ...made, id: "kurz" }).success).toBe(false);
    expect(LinkCreated.safeParse({ ...made, expiresAt: -1 }).success).toBe(false);
  });
});

describe("LinkList and LinkFetched", () => {
  it("list a creator's links with what is left of them", () => {
    const summary = { id, createdAt: 1, expiresAt: 2, maxFetches: 3, remaining: 0 };
    expect(LinkList.parse({ links: [summary] })).toEqual({ links: [summary] });
    expect(LinkSummary.safeParse({ ...summary, id: "x" }).success).toBe(false);
    for (const key of ["createdAt", "expiresAt", "maxFetches", "remaining"])
      expect(LinkSummary.safeParse({ ...summary, [key]: -1 }).success).toBe(false);
  });

  it("hand a recipient the ciphertext and what is left", () => {
    const fetched = LinkFetched.parse({ ciphertext: ciphertext(3), remaining: 1, expiresAt: 9 });
    expect(fetched).toEqual({ ciphertext: new Uint8Array(3).fill(1), remaining: 1, expiresAt: 9 });
    expect(LinkFetched.safeParse({ ciphertext: "!", remaining: 1, expiresAt: 9 }).success).toBe(
      false,
    );
    expect(
      LinkFetched.safeParse({ ciphertext: ciphertext(3), remaining: -1, expiresAt: 9 }).success,
    ).toBe(false);
    expect(
      LinkFetched.safeParse({ ciphertext: ciphertext(3), remaining: 1, expiresAt: -9 }).success,
    ).toBe(false);
  });
});

import { ed25519KeyPair, rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import {
  activeLinks,
  LINK_PASSPHRASE_BYTES,
  type LinkedCompanies,
  LinkedCompanies as LinkedSchema,
  linkCompany,
  linkedToJson,
  mergeLinked,
  newLinkPassphrase,
  unlinkCompany,
} from "./linked.ts";
import { emptyState, mergeStates, openState, sealState } from "./state.ts";

// K-605: Weber Haustechnik's Jonas is also in Müller Elektro, with an account of its own there
const mueller = new Uint8Array(16).fill(7);
const meier = new Uint8Array(16).fill(9);
const muellerId = encodeBytes(mueller);
const meierId = encodeBytes(meier);
const way = (fill: number) => ({
  secretKey: new Uint8Array(16).fill(fill),
  passphrase: encodeBytes(new Uint8Array(32).fill(fill)),
});
const linked = (): LinkedCompanies =>
  linkCompany({}, mueller, "Müller Elektro", way(1), 1000) ?? {};

describe("further companies in the account state", () => {
  it("makes a passphrase of 32 random bytes, never shown", () => {
    const asked: number[] = [];
    const made = newLinkPassphrase((length) => {
      asked.push(length);
      return new Uint8Array(length).fill(255);
    });
    expect(asked).toEqual([LINK_PASSPHRASE_BYTES]);
    expect(LINK_PASSPHRASE_BYTES).toBe(32);
    expect(made).toBe(encodeBytes(new Uint8Array(32).fill(255)));
    expect(newLinkPassphrase()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newLinkPassphrase()).not.toBe(newLinkPassphrase());
  });

  it("links a company with its way in, once per account", () => {
    expect(linked()).toEqual({
      [muellerId]: { name: "Müller Elektro", at: 1000, ...{ credentials: way(1) } },
    });
    expect(linkCompany(linked(), mueller, "Noch einmal", way(2), 2000)).toBeUndefined();
    const removed = unlinkCompany(linked(), muellerId) ?? {};
    expect(linkCompany(removed, mueller, "Wieder", way(2), 2000)).toBeUndefined();
  });

  it("links only a valid name and way in", () => {
    expect(linkCompany({}, meier, "  ", way(1), 1)).toBeUndefined();
    expect(linkCompany({}, meier, "x".repeat(101), way(1), 1)).toBeUndefined();
    expect(linkCompany({}, meier, "x".repeat(100), way(1), 1)).toBeDefined();
    expect(linkCompany({}, meier, " Meier ", way(1), 1)?.[meierId]?.name).toBe("Meier");
    expect(
      linkCompany(
        {},
        meier,
        "Meier",
        { secretKey: new Uint8Array(15), passphrase: way(1).passphrase },
        1,
      ),
    ).toBeUndefined();
    expect(linkCompany({}, meier, "Meier", { ...way(1), passphrase: "short" }, 1)).toBeUndefined();
    expect(linkCompany({}, meier, "Meier", way(1), -1)).toBeUndefined();
  });

  it("removes a company: its way in goes, a tombstone stays", () => {
    expect(unlinkCompany(linked(), muellerId)).toEqual({
      [muellerId]: { name: "Müller Elektro", at: 1000 },
    });
    expect(unlinkCompany(linked(), meierId)).toBeUndefined();
    expect(unlinkCompany(unlinkCompany(linked(), muellerId) ?? {}, muellerId)).toBeUndefined();
  });

  it("lists the companies still linked, oldest first", () => {
    const both = linkCompany(linked(), meier, "Meier Bau", way(2), 500) ?? {};
    expect(activeLinks(both)).toEqual([
      { accountId: meierId, name: "Meier Bau", ...way(2) },
      { accountId: muellerId, name: "Müller Elektro", ...way(1) },
    ]);
    expect(activeLinks(unlinkCompany(both, meierId) ?? {})).toEqual([
      { accountId: muellerId, name: "Müller Elektro", ...way(1) },
    ]);
    expect(activeLinks({})).toEqual([]);
  });

  it("merges both sides; a removal on either side wins", () => {
    const mine = linked();
    const theirs = linkCompany({}, meier, "Meier Bau", way(2), 500) ?? {};
    const both = { ...mine, ...theirs };
    expect(mergeLinked(mine, theirs)).toEqual(both);
    expect(mergeLinked(theirs, mine)).toEqual(both);
    const removed = unlinkCompany(mine, muellerId) ?? {};
    expect(mergeLinked(mine, removed)).toEqual(removed);
    expect(mergeLinked(removed, mine)).toEqual(removed);
    expect(mergeLinked(removed, removed)).toEqual(removed);
    expect(mergeLinked(mine, mine)).toEqual(mine);
    // The same company with another way in: the own one stays
    const other = { [muellerId]: { name: "Anders", at: 3, credentials: way(5) } };
    expect(mergeLinked(mine, other)).toEqual(mine);
  });

  it("accepts only account IDs of 16 bytes as keys", () => {
    expect(LinkedSchema.safeParse({ short: { name: "x", at: 1 } }).success).toBe(false);
    expect(LinkedSchema.safeParse({ [muellerId]: { name: "x", at: 1 } }).success).toBe(true);
    expect(LinkedSchema.safeParse({ [`${muellerId}!`]: { name: "x", at: 1 } }).success).toBe(false);
    expect(LinkedSchema.safeParse({ [`!${muellerId}`]: { name: "x", at: 1 } }).success).toBe(false);
    const stored = (passphrase: string) =>
      LinkedSchema.safeParse({
        [muellerId]: {
          name: "x",
          at: 1,
          credentials: { secretKey: encodeBytes(way(1).secretKey), passphrase },
        },
      }).success;
    expect(stored(way(1).passphrase)).toBe(true);
    expect(stored(`${way(1).passphrase}!`)).toBe(false);
    expect(stored(`!${way(1).passphrase}`)).toBe(false);
  });

  it("writes the Secret Keys as base64url, tombstones as they are", () => {
    const removed = unlinkCompany(linkCompany(linked(), meier, "Meier", way(2), 5) ?? {}, meierId);
    expect(linkedToJson(removed ?? {})).toEqual({
      [muellerId]: {
        name: "Müller Elektro",
        at: 1000,
        credentials: { secretKey: encodeBytes(way(1).secretKey), passphrase: way(1).passphrase },
      },
      [meierId]: { name: "Meier", at: 5 },
    });
  });

  it("travels sealed in the account state and merges with it", () => {
    const root = rootFingerprint(ed25519KeyPair(new Uint8Array(32).fill(3)).publicKey);
    const key = new Uint8Array(32).fill(4);
    const account = new Uint8Array(16).fill(5);
    const state = { ...emptyState(root), linked: linked() };
    expect(emptyState(root).linked).toEqual({});
    expect(openState(key, account, 1, sealState(key, account, 1, state))).toEqual({
      ok: true,
      value: state,
    });
    const removed = { ...emptyState(root), linked: unlinkCompany(linked(), muellerId) ?? {} };
    expect(mergeStates(state, removed)).toEqual({ ok: true, value: removed });
    expect(mergeStates(removed, state)).toEqual({ ok: true, value: removed });
    expect(mergeStates(emptyState(root), state)).toEqual({ ok: true, value: state });
  });
});

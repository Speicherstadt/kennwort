import { describe, expect, it } from "vitest";
import { rootFingerprint } from "./fingerprint.ts";
import {
  isSignedRootChange,
  ROOT_CHANGE_ACCEPT_PURPOSE,
  ROOT_CHANGE_PURPOSE,
  type RootChange,
  rootChangeMessage,
  signRootChange,
} from "./root-change.ts";
import { ed25519KeyPair, sign } from "./sign.ts";

const filled = (length: number, value: number) => new Uint8Array(length).fill(value);

const oldRoot = ed25519KeyPair(filled(32, 1));
const newRoot = ed25519KeyPair(filled(32, 2));
const company = filled(16, 3);
const change = signRootChange(oldRoot.secretKey, newRoot.secretKey, company, 1_795_000_000);

describe("a new company root (F-14)", () => {
  it("names the company, both roots and the time", () => {
    expect(change.companyId).toEqual(company);
    expect(change.oldRootPublicKey).toEqual(oldRoot.publicKey);
    expect(change.newRootPublicKey).toEqual(newRoot.publicKey);
    expect(change.time).toBe(1_795_000_000);
  });

  it("is signed by the old root as root-change and by the new one as root-change-accept", () => {
    expect(ROOT_CHANGE_PURPOSE).toBe("root-change");
    expect(ROOT_CHANGE_ACCEPT_PURPOSE).toBe("root-change-accept");
    const message = rootChangeMessage(change);
    expect(change.oldSignature).toEqual(sign(oldRoot.secretKey, "root-change", message));
    expect(change.newSignature).toEqual(sign(newRoot.secretKey, "root-change-accept", message));
    expect(isSignedRootChange(change)).toBe(true);
  });

  it("starts with its label and names the old root by its fingerprint", () => {
    const message = rootChangeMessage(change);
    expect(new TextDecoder().decode(message.subarray(4, 27))).toBe("kennwort/root-change/v1");
    expect(message.subarray(51, 83)).toEqual(rootFingerprint(oldRoot.publicKey));
  });

  const changes: [string, RootChange][] = [
    ["company", { ...change, companyId: filled(16, 9) }],
    ["old root", { ...change, oldRootPublicKey: ed25519KeyPair(filled(32, 9)).publicKey }],
    ["new root", { ...change, newRootPublicKey: ed25519KeyPair(filled(32, 9)).publicKey }],
    ["time", { ...change, time: change.time + 1 }],
  ];
  it.each(changes)("does not hold with another %s", (_, changed) => {
    expect(isSignedRootChange(changed)).toBe(false);
  });

  it("does not hold without the old root's signature or with the signatures swapped", () => {
    const other = signRootChange(newRoot.secretKey, newRoot.secretKey, company, change.time);
    expect(isSignedRootChange({ ...change, oldSignature: other.oldSignature })).toBe(false);
    expect(
      isSignedRootChange({
        ...change,
        oldSignature: change.newSignature,
        newSignature: change.oldSignature,
      }),
    ).toBe(false);
  });

  it("does not hold when the new root did not sign it back", () => {
    const stranger = ed25519KeyPair(filled(32, 8));
    const claimed = { ...change, newRootPublicKey: stranger.publicKey };
    const oldSignature = sign(oldRoot.secretKey, "root-change", rootChangeMessage(claimed));
    expect(isSignedRootChange({ ...claimed, oldSignature })).toBe(false);
  });
});

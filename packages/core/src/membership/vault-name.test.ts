// The name of a vault, sealed with its key (P-05): only members read it, and it stays in its vault

import { seal } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { NAME_LENGTH, openVaultName, sealVaultName } from "./vault-name.ts";

const ring = {
  vaultId: new Uint8Array(16).fill(1),
  epoch: 0,
  vaultKey: new Uint8Array(32).fill(2),
};

describe("vault name", () => {
  it("opens what it sealed, trimmed and in NFC", () => {
    const sealed = sealVaultName(ring, "  Büro  ");
    expect(openVaultName(ring, sealed)).toEqual({ ok: true, value: "Büro" });
  });

  it("opens the fixed vector (F-01, purpose vault-name, vault and epoch as context)", () => {
    const vector = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBATT20yIwbAYnjnJ5T-nKx6o0ZZGlfw";
    expect(openVaultName(ring, Buffer.from(vector, "base64url"))).toEqual({
      ok: true,
      value: "Büro",
    });
  });

  it("is not read under another vault, epoch or key", () => {
    const sealed = sealVaultName(ring, "Büro");
    const failed = { ok: false, error: "not-authentic" };
    expect(openVaultName({ ...ring, vaultId: new Uint8Array(16).fill(9) }, sealed)).toEqual(failed);
    expect(openVaultName({ ...ring, epoch: 1 }, sealed)).toEqual(failed);
    expect(openVaultName({ ...ring, vaultKey: new Uint8Array(32).fill(3) }, sealed)).toEqual(
      failed,
    );
  });

  it("takes names of 1 to NAME_LENGTH characters, never an empty one", () => {
    expect(() => sealVaultName(ring, "   ")).toThrow("bad-name");
    expect(() => sealVaultName(ring, "x".repeat(NAME_LENGTH + 1))).toThrow("bad-name");
    expect(openVaultName(ring, sealVaultName(ring, "x".repeat(NAME_LENGTH)))).toEqual({
      ok: true,
      value: "x".repeat(NAME_LENGTH),
    });
    expect(openVaultName(ring, sealVaultName(ring, "x"))).toEqual({ ok: true, value: "x" });
  });

  it("refuses a sealed text that is no clean name, even under the right key", () => {
    const sealedRaw = (bytes: number[]) =>
      seal(ring.vaultKey, new Uint8Array(bytes), {
        purpose: "vault-name",
        context: [ring.vaultId, ring.epoch],
      });
    const bad = { ok: false, error: "bad-name" };
    expect(openVaultName(ring, sealedRaw([0x20, 0x78]))).toEqual(bad);
    expect(openVaultName(ring, sealedRaw([0xff]))).toEqual(bad);
    expect(openVaultName(ring, sealedRaw([0xef, 0xbb, 0xbf, 0x78]))).toEqual(bad);
    expect(openVaultName(ring, sealedRaw([]))).toEqual(bad);
  });
});

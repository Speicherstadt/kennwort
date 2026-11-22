import {
  createAccount,
  emptyState,
  encodeBytes,
  grantRecoveryKey,
  newCompanyRecoveryKey,
  type Policy,
  recoveryPolicy,
  signPolicy,
  standardPolicy,
} from "@kennwort/core";
import {
  type Deposit,
  depositAccountKey,
  ed25519KeyPair,
  holdsAccountKey,
  passphraseKeysWith,
  rootFingerprint,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { Opened } from "../session/open-account.ts";
import { keepDeposit, ownRecoveryKey } from "./recovery.ts";

// K-307 part c: Anna's client deposits only to the key the root-signed policy names (the lying server)
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const weber = new Uint8Array(16).fill(0xc0);
const anna = createAccount("Anna Heizung Bad", emptyState(rootFingerprint(root.publicKey)), {
  derive: quick,
});
const opened = (seenPolicy = 0): Opened => ({
  accountKey: anna.accountKey,
  keyBlock: anna.keyBlock,
  state: { ...anna.state, policy: seenPolicy },
  accountId: anna.accountId,
  token: "token-anna",
});
const key = newCompanyRecoveryKey();
const on = recoveryPolicy(root.secretKey, standardPolicy(weber), key.fingerprint);
const place = { companyId: weber, accountId: anna.accountId };

/** A server that serves what it is given and records every deposit it is sent */
const server = (served: { policy: Policy | null; key: Uint8Array | null; held?: Deposit }) => {
  const saved: Deposit[] = [];
  return {
    saved,
    api: {
      company: async () => ({
        id: encodeBytes(weber),
        rootPublicKey: root.publicKey,
        policy: served.policy,
        recoveryPublicKey: served.key,
      }),
      heldDeposit: async () => served.held,
      saveDeposit: async (_token: string, deposit: Deposit) => {
        saved.push(deposit);
        return true;
      },
    },
  };
};

describe("keepDeposit", () => {
  it("deposits AK to the key the policy names, a deposit the owner can check", async () => {
    const s = server({ policy: on, key: key.publicKey });
    expect(await keepDeposit(s.api, opened())).toBe("deposited");
    expect(s.saved).toHaveLength(1);
    const [deposit] = s.saved as [Deposit];
    expect(
      holdsAccountKey(deposit, anna.accountKey, anna.keyBlock.ed.publicKey, place, key.fingerprint),
    ).toBe(true);
  });

  it("never deposits to a key the server swaps in, or when it serves none", async () => {
    for (const served of [newCompanyRecoveryKey().publicKey, null]) {
      const s = server({ policy: on, key: served });
      expect(await keepDeposit(s.api, opened())).toBe("other-key");
      expect(s.saved).toEqual([]);
    }
  });

  it("never deposits under a forged policy naming the server's key", async () => {
    const servers = newCompanyRecoveryKey();
    const forged = recoveryPolicy(
      ed25519KeyPair().secretKey,
      standardPolicy(weber),
      servers.fingerprint,
    );
    const s = server({ policy: forged, key: servers.publicKey });
    expect(await keepDeposit(s.api, opened())).toBe("invalid");
    expect(s.saved).toEqual([]);
  });

  it("never deposits under an older policy played back after recovery went off", async () => {
    const off = recoveryPolicy(root.secretKey, { ...on }, undefined);
    const s = server({ policy: on, key: key.publicKey });
    expect(await keepDeposit(s.api, opened(off.version))).toBe("invalid");
    expect(s.saved).toEqual([]);
  });

  it("deposits nothing while recovery is off or there is no policy", async () => {
    const off = signPolicy(root.secretKey, { ...standardPolicy(weber), version: 1 });
    for (const policy of [off, null]) {
      const s = server({ policy, key: key.publicKey });
      expect(await keepDeposit(s.api, opened())).toBe("off");
      expect(s.saved).toEqual([]);
    }
  });

  it("keeps its own deposit, and deposits anew when the server replays one for an earlier key", async () => {
    const held = depositAccountKey(key, anna.accountKey, place, anna.keyBlock.ed.secretKey);
    const kept = server({ policy: on, key: key.publicKey, held });
    expect(await keepDeposit(kept.api, opened())).toBe("kept");
    expect(kept.saved).toEqual([]);
    const earlier = newCompanyRecoveryKey();
    const old = depositAccountKey(earlier, anna.accountKey, place, anna.keyBlock.ed.secretKey);
    const replayed = server({ policy: on, key: key.publicKey, held: old });
    expect(await keepDeposit(replayed.api, opened())).toBe("deposited");
    expect(replayed.saved).toHaveLength(1);
  });

  it("says when the server is away or the deposit not taken", async () => {
    const away = {
      ...server({ policy: on, key: key.publicKey }).api,
      company: async () => undefined,
    };
    expect(await keepDeposit(away, opened())).toBe("unreachable");
    const refusing = {
      ...server({ policy: on, key: key.publicKey }).api,
      saveDeposit: async () => false,
    };
    expect(await keepDeposit(refusing, opened())).toBe("unreachable");
  });
});

describe("ownRecoveryKey", () => {
  const annaCert = {
    accountId: anna.accountId,
    xwingPublicKey: anna.keyBlock.xwing.publicKey,
    edPublicKey: anna.keyBlock.ed.publicKey,
    companyId: weber,
    role: "owner" as const,
    issuedAt: 1,
    signature: new Uint8Array(65),
  };
  const withGrant = (policy: Policy | null, grant: Uint8Array | undefined) => ({
    ...server({ policy, key: key.publicKey }).api,
    recoveryGrant: async () => grant,
  });

  it("opens the key wrapped to this owner when the policy names it", async () => {
    const api = withGrant(on, grantRecoveryKey(key.secretKey, annaCert));
    expect(await ownRecoveryKey(api, opened())).toEqual({ ok: true, value: key });
  });

  it("refuses a key the server wrapped itself, no grant, or recovery off", async () => {
    const servers = newCompanyRecoveryKey();
    expect(
      await ownRecoveryKey(withGrant(on, grantRecoveryKey(servers.secretKey, annaCert)), opened()),
    ).toEqual({
      ok: false,
      error: "other-key",
    });
    expect(await ownRecoveryKey(withGrant(on, undefined), opened())).toEqual({
      ok: false,
      error: "none",
    });
    expect(await ownRecoveryKey(withGrant(null, undefined), opened())).toEqual({
      ok: false,
      error: "off",
    });
    const forged = recoveryPolicy(
      ed25519KeyPair().secretKey,
      standardPolicy(weber),
      key.fingerprint,
    );
    expect(await ownRecoveryKey(withGrant(forged, undefined), opened())).toEqual({
      ok: false,
      error: "not-signed",
    });
  });
});

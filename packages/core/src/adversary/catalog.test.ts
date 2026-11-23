/**
 * The attacks of the catalog (docs/sicherheitsdesign.md, E-01…E-27) that no other adversary test
 * replays yet (K-701): fields swapped inside an entry, metadata read or changed, lowered key
 * derivation, entries slipped into an export, the passphrase taken at sign-in, and a new device's
 * pairing redirected or a device of the server's own registered.
 */
import {
  deviceFingerprint,
  encode,
  passphraseKeysWith,
  wrap,
  xwingKeyPair,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createAccount } from "../account/create.ts";
import {
  openDevicePackage,
  sealDevicePackage,
  stateHash,
  unlockWithDevicePackage,
} from "../account/pairing.ts";
import { emptyState } from "../account/state.ts";
import { type Derive, type Post, signInWithPassphrase } from "../auth/sign-in.ts";
import { exportVaults } from "../export/payload.ts";
import { encodeBytes } from "../sync/bytes.ts";
import { edit, emptyDevice, pull, sync } from "../sync/device.ts";
import { memoryServer } from "../sync/memory-server.ts";
import { type EntryRecord, recordToWire, sealRecord } from "../sync/record.ts";
import { bank, contextFor, id, jonas, person, vaultId, vaultKey } from "../sync/test/fixtures.ts";
import { lyingServer } from "./lying-server.ts";

const errors = (refused: { error: string }[]) => refused.map((r) => r.error);

/** Jonas saved the bank entry twice; the server holds both versions */
const savedTwice = async () => {
  const server = memoryServer();
  let device = edit(emptyDevice(), id(0xe1), bank);
  device = (await sync(device, server, contextFor(jonas))).device;
  const first = server.pull()[0] as EntryRecord;
  device = edit(device, id(0xe1), { ...bank, title: "Sparkasse Hamburg" });
  await sync(device, server, contextFor(jonas));
  return { server, first, second: server.pull()[0] as EntryRecord };
};

describe("E-11 the server swaps fields inside an entry", () => {
  it("has no field to swap: every field is in one ciphertext, so a reordered one is refused", async () => {
    const { server } = await savedTwice();
    const halves = (record: EntryRecord) => {
      const middle = Math.floor(record.content.length / 2);
      const content = new Uint8Array(record.content.length);
      content.set(record.content.subarray(middle));
      content.set(record.content.subarray(0, middle), record.content.length - middle);
      return { ...record, content };
    };
    const { device, refused } = await pull(
      emptyDevice(),
      lyingServer(server, { pull: (records) => records.map(halves) }),
      contextFor(jonas),
    );
    expect(errors(refused)).toEqual(["bad-signature"]);
    expect(device.known.size).toBe(0);
  });

  it("refuses the content of one version under the entry key of another", async () => {
    const { server, first } = await savedTwice();
    const { refused } = await pull(
      emptyDevice(),
      lyingServer(server, {
        pull: (records) => records.map((r) => ({ ...r, content: first.content })),
      }),
      contextFor(jonas),
    );
    expect(errors(refused)).toEqual(["bad-signature"]);
  });
});

describe("E-14 the server reads or changes unprotected metadata", () => {
  const record = sealRecord(
    { id: jonas.id, edSecretKey: jonas.ed.secretKey },
    { vaultId, epoch: 0, vaultKey },
    id(0xe1),
    1,
    bank,
    new Uint8Array(32),
  );

  it("sees no title, URL, user name, tag or kind of entry on the wire", () => {
    expect(Object.keys(record).sort()).toEqual(
      [
        "author",
        "content",
        "entryId",
        "entryKey",
        "epoch",
        "lastSeen",
        "signature",
        "vaultId",
        "version",
      ].sort(),
    );
    const wire = JSON.stringify(recordToWire(record));
    for (const plain of [
      "Sparkasse",
      "sparkasse.test",
      "weber-haustechnik",
      "Weber-2026!",
      "Bank",
      "login",
    ])
      expect(wire).not.toContain(plain);
  });

  it("cannot point the URL elsewhere: the URL is inside the signed ciphertext", async () => {
    const { server } = await savedTwice();
    const { refused } = await pull(
      emptyDevice(),
      lyingServer(server, {
        pull: (records) =>
          records.map((r) => ({ ...r, content: r.content.map((b, i) => (i === 40 ? b ^ 1 : b)) })),
      }),
      contextFor(jonas),
    );
    expect(errors(refused)).toEqual(["bad-signature"]);
  });
});

describe("E-21 the server slips entries into an import or export", () => {
  it("leaves a record it made up out of what the device holds, so out of the export", async () => {
    const { server, second } = await savedTwice();
    const mallory = person(0x66);
    const forged = sealRecord(
      { id: mallory.id, edSecretKey: mallory.ed.secretKey },
      { vaultId, epoch: 0, vaultKey },
      id(0xe9),
      1,
      { ...bank, title: "Untergeschoben" },
      second.lastSeen,
    );
    const { device, refused } = await pull(
      emptyDevice(),
      lyingServer(server, { pull: (records) => [...records, forged] }),
      contextFor(jonas),
    );
    expect(errors(refused)).toEqual(["uncertified-author"]);
    const exported = exportVaults([
      { name: "Büro", entries: [...device.known.values()].map((known) => known.content) },
    ]);
    expect(exported[0]?.entries.map((entry) => entry.title)).toEqual(["Sparkasse Hamburg"]);
  });
});

/** A server that answers the sign-in with whatever it wants to add to the challenge */
const recordingServer = (extra: Record<string, unknown>) => {
  const bodies: unknown[] = [];
  const post: Post = async (path, body) => {
    bodies.push(body);
    if (path.endsWith("/challenge"))
      return {
        status: 200,
        json: {
          challengeId: "c1",
          challenge: encodeBytes(new Uint8Array(32).fill(7)),
          accountSalt: encodeBytes(new Uint8Array(16).fill(3)),
          ...extra,
        },
      };
    return { status: 200, json: { token: "t" } };
  };
  return { post, bodies };
};
const quick: Derive = (p, salt, key, account) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const passphrase = "Heizung Wasser Licht Kupfer";
const secretKey = new Uint8Array(16).fill(0x2a);

describe("E-18 the server lowers the parameters of key derivation", () => {
  it("ignores any cost the server names: the parameters belong to the format version", async () => {
    const calls: unknown[][] = [];
    const derive: Derive = (...args) => {
      calls.push(args);
      return quick(...args);
    };
    const honest = recordingServer({});
    const lying = recordingServer({
      kdf: { m: 8, t: 1, p: 1 },
      kdfIterations: 1,
      argon2: { m: 1 },
    });
    await signInWithPassphrase(honest.post, jonas.id, passphrase, secretKey, derive);
    await signInWithPassphrase(lying.post, jonas.id, passphrase, secretKey, derive);
    expect(calls.map((args) => args.length)).toEqual([4, 4]);
    expect(calls[1]).toEqual(calls[0]);
    expect(lying.bodies[1]).toEqual(honest.bodies[1]);
  });
});

describe("E-24 the server takes the passphrase at sign-in", () => {
  it("gets the account ID and one signature, never the passphrase, Secret Key or a key from them", async () => {
    const server = recordingServer({});
    expect(await signInWithPassphrase(server.post, jonas.id, passphrase, secretKey, quick)).toEqual(
      {
        ok: true,
        token: "t",
      },
    );
    const keys = quick(passphrase, new Uint8Array(16).fill(3), secretKey, jonas.id);
    const sent = JSON.stringify(server.bodies);
    for (const secret of [
      passphrase,
      encodeBytes(secretKey),
      encodeBytes(keys.unlock),
      encodeBytes(keys.login),
    ])
      expect(sent).not.toContain(secret);
    expect(Object.keys(server.bodies[0] as object).sort()).toEqual(["accountId", "way"]);
    expect(Object.keys(server.bodies[1] as object).sort()).toEqual(["challengeId", "signature"]);
  });
});

describe("E-09 and E-25 the server registers a device of its own or redirects a pairing", () => {
  const quickAccount = createAccount(passphrase, emptyState(new Uint8Array(32).fill(1)), {
    derive: quick,
  });
  const stored = {
    accountId: quickAccount.accountId,
    accountSalt: quickAccount.upload.accountSalt,
    keyBlock: quickAccount.upload.keyBlock,
    state: quickAccount.upload.state,
    stateCounter: 0,
    unlock: quickAccount.upload.unlock,
  };
  const content = {
    accountKey: quickAccount.accountKey,
    accountId: quickAccount.accountId,
    secretKey: quickAccount.secretKey,
    stateHash: stateHash(quickAccount.upload.state),
  };
  const newDevice = xwingKeyPair();
  const pairingSecret = new Uint8Array(32).fill(0x5a);

  it("hands its own device a package that opens only with the secret it never saw", () => {
    const servers = xwingKeyPair();
    const pkg = sealDevicePackage(newDevice.publicKey, pairingSecret, content);
    // The server swaps the announced key for its own: the fingerprint in the QR code no longer fits
    expect(deviceFingerprint(servers.publicKey)).not.toEqual(
      deviceFingerprint(newDevice.publicKey),
    );
    expect(openDevicePackage(servers.secretKey, servers.publicKey, pairingSecret, pkg).ok).toBe(
      false,
    );
  });

  it("cannot answer the new device with a package of its own making", () => {
    const to = {
      publicKey: newDevice.publicKey,
      fingerprint: deviceFingerprint(newDevice.publicKey),
    };
    const forged = wrap(
      to,
      encode(content.accountKey, content.accountId, content.secretKey, content.stateHash),
      { purpose: "device", context: [new Uint8Array(32)] },
    );
    expect(
      openDevicePackage(newDevice.secretKey, newDevice.publicKey, pairingSecret, forged),
    ).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("cannot hand the paired device another account state than the one in the package", () => {
    const other = createAccount(passphrase, emptyState(new Uint8Array(32).fill(2)), {
      derive: quick,
    });
    expect(unlockWithDevicePackage({ ...stored, state: other.upload.state }, content)).toEqual({
      ok: false,
      error: "other-state",
    });
    expect(unlockWithDevicePackage({ ...stored, accountId: other.accountId }, content)).toEqual({
      ok: false,
      error: "other-account",
    });
  });
});

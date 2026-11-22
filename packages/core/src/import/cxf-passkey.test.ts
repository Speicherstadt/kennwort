import { generateKeyPairSync } from "node:crypto";
import { passkeyPublicKey } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { es256Key, passkeyEntry } from "./cxf-passkey.ts";

/** A DER element; lengths past 127 in one byte after 0x81, as node:crypto writes them */
const tlv = (tag: number, ...parts: Uint8Array[]) => {
  const body = Buffer.concat(parts);
  const length = body.length < 0x80 ? [body.length] : [0x81, body.length];
  return new Uint8Array([tag, ...length, ...body]);
};
const bytes = (hexText: string) => new Uint8Array(Buffer.from(hexText, "hex"));
const ALGORITHM = bytes("06072a8648ce3d020106082a8648ce3d030107");
const P384_ALGORITHM = bytes("06072a8648ce3d020106052b81040022");
const D = new Uint8Array(32).map((_, i) => i + 1);
const f12 = (d: Uint8Array) => Uint8Array.of(1, ...d);

/** PKCS#8 of a P-256 key built by hand, so each part can be broken on its own */
const pkcs8 = ({
  algorithm = tlv(0x30, ALGORITHM),
  scalar = tlv(0x04, D),
  tail = [] as Uint8Array[],
} = {}) =>
  tlv(
    0x30,
    tlv(0x02, Uint8Array.of(0)),
    algorithm,
    tlv(0x04, tlv(0x30, tlv(0x02, Uint8Array.of(1)), scalar, ...tail)),
  );
const publicKeyOf = (d: Uint8Array) => {
  const key = passkeyPublicKey(f12(d));
  return key.ok ? key.value : new Uint8Array();
};
const withPublicKey = (point: Uint8Array) => [tlv(0xa1, tlv(0x03, Uint8Array.of(0), point))];

describe("ES256 keys from PKCS#8 (CXF passkeys, K-502)", () => {
  it("reads node:crypto's P-256 keys, with their public key, as F-12", () => {
    for (let i = 0; i < 5; i++) {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const der = privateKey.export({ type: "pkcs8", format: "der" });
      const { d } = privateKey.export({ format: "jwk" });
      expect(es256Key(new Uint8Array(der))).toEqual(f12(Buffer.from(d ?? "", "base64url")));
    }
  });

  it("reads a key without its public key, and one whose public key fits", () => {
    expect(es256Key(pkcs8())).toEqual(f12(D));
    expect(es256Key(pkcs8({ tail: withPublicKey(publicKeyOf(D)) }))).toEqual(f12(D));
    expect(es256Key(pkcs8({ tail: [tlv(0xa0, ALGORITHM.subarray(9))] }))).toEqual(f12(D));
  });

  it("refuses a key whose public key is another", () => {
    const other = publicKeyOf(new Uint8Array(32).fill(7));
    expect(es256Key(pkcs8({ tail: withPublicKey(other) }))).toBeUndefined();
    const unusedBits = [tlv(0xa1, tlv(0x03, Uint8Array.of(1), publicKeyOf(D)))];
    expect(es256Key(pkcs8({ tail: unusedBits }))).toBeUndefined();
    const notBits = [tlv(0xa1, tlv(0x04, Uint8Array.of(0), publicKeyOf(D)))];
    expect(es256Key(pkcs8({ tail: notBits }))).toBeUndefined();
    expect(es256Key(pkcs8({ tail: [tlv(0xa1)] }))).toEqual(f12(D));
  });

  it("refuses every key but P-256", () => {
    for (const type of ["ed25519", "x25519"] as const) {
      const { privateKey } = generateKeyPairSync(type as "ed25519");
      expect(es256Key(new Uint8Array(privateKey.export({ type: "pkcs8", format: "der" })))).toBe(
        undefined,
      );
    }
    for (const namedCurve of ["P-384", "secp256k1"]) {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve });
      expect(es256Key(new Uint8Array(privateKey.export({ type: "pkcs8", format: "der" })))).toBe(
        undefined,
      );
    }
    expect(es256Key(pkcs8({ algorithm: tlv(0x30, P384_ALGORITHM) }))).toBeUndefined();
    expect(es256Key(pkcs8({ algorithm: tlv(0x31, ALGORITHM) }))).toBeUndefined();
  });

  it("refuses a scalar of another length, tag or range", () => {
    expect(es256Key(pkcs8({ scalar: tlv(0x04, D.subarray(1)) }))).toBeUndefined();
    expect(es256Key(pkcs8({ scalar: tlv(0x04, Uint8Array.of(0, ...D)) }))).toBeUndefined();
    expect(es256Key(pkcs8({ scalar: tlv(0x02, D) }))).toBeUndefined();
    expect(es256Key(pkcs8({ scalar: tlv(0x04, new Uint8Array(32)) }))).toBeUndefined();
    expect(es256Key(pkcs8({ scalar: tlv(0x04, new Uint8Array(32).fill(0xff)) }))).toBeUndefined();
  });

  it("refuses DER whose lengths do not fit", () => {
    const good = pkcs8();
    expect(es256Key(Uint8Array.of(...good, 0))).toBeUndefined();
    expect(es256Key(Uint8Array.of(...good, ...good))).toBeUndefined();
    expect(es256Key(good.subarray(0, good.length - 1))).toBeUndefined();
    expect(es256Key(new Uint8Array())).toBeUndefined();
    expect(es256Key(Uint8Array.of(0x30))).toBeUndefined();
    expect(es256Key(Uint8Array.of(0x30, 0x81))).toBeUndefined();
    // Indefinite length and two length bytes: no P-256 key needs either
    expect(es256Key(Uint8Array.of(0x30, 0x80, ...good.subarray(2), 0, 0))).toBeUndefined();
    expect(es256Key(Uint8Array.of(0x30, 0x82, 0, good[1] as number, ...good.subarray(2)))).toBe(
      undefined,
    );
    // The same key with its outer length in the long form reads as before
    expect(es256Key(Uint8Array.of(0x30, 0x81, ...good.subarray(1)))).toEqual(f12(D));
    const brokenInner = tlv(0x30, tlv(0x02, Uint8Array.of(0)), tlv(0x30, Uint8Array.of(0x06)));
    expect(es256Key(brokenInner)).toBeUndefined();
  });
});

const KEY = Buffer.from(pkcs8()).toString("base64url");
const passkey = {
  credentialId: "Y3JlZA",
  rpId: " portal.example ",
  username: "max",
  userDisplayName: "Max Weber",
  userHandle: "dXNlcg",
  key: KEY,
};
const item = { title: "Portal", favorite: false, tags: [], folders: [] };

describe("CXF passkeys as passkey entries (K-502)", () => {
  it("makes an F-12 passkey entry with the item's title, favorite, tags and folders", () => {
    const entry = passkeyEntry(passkey, {
      title: "",
      favorite: true,
      tags: ["b", " a"],
      folders: ["Büro", ""],
    });
    expect(entry).toEqual({
      content: {
        type: "passkey",
        title: "portal.example",
        fields: [
          { id: "rp-id", name: "rp-id", value: "portal.example", kind: "text" },
          { id: "username", name: "username", value: "max", kind: "text" },
          { id: "display-name", name: "display-name", value: "Max Weber", kind: "text" },
          { id: "user-handle", name: "user-handle", value: "dXNlcg", kind: "text" },
          { id: "credential-id", name: "credential-id", value: "Y3JlZA", kind: "text" },
          {
            id: "private-key",
            name: "private-key",
            value: Buffer.from(f12(D)).toString("base64url"),
            kind: "secret",
          },
          { id: "counter", name: "counter", value: "0", kind: "text" },
        ],
        tags: ["a", "b"],
        favorite: true,
        history: [],
      },
      folders: ["Büro"],
    });
  });

  it("takes base64url with padding", () => {
    const padded = { ...passkey, credentialId: "Y3JlZA==", userHandle: "dXNlcg==" };
    expect(passkeyEntry(padded, item)?.content.title).toBe("Portal");
  });

  it("leaves out a passkey without relying party, credential ID, user handle or key", () => {
    const broken = [
      { ...passkey, rpId: " " },
      { ...passkey, credentialId: "" },
      { ...passkey, credentialId: "!" },
      { ...passkey, userHandle: "?" },
      { ...passkey, userHandle: Buffer.alloc(65).toString("base64url") },
      { ...passkey, key: "" },
      { ...passkey, key: "AAAA" },
      { ...passkey, key: 7 },
      "passkey",
    ];
    for (const credential of broken) expect(passkeyEntry(credential, item)).toBeUndefined();
    const longest = { ...passkey, userHandle: Buffer.alloc(64).toString("base64url") };
    expect(passkeyEntry(longest, item)).toBeDefined();
    expect(passkeyEntry({ ...passkey, userHandle: "" }, item)).toBeDefined();
  });
});

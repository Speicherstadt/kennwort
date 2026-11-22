/**
 * Writes passkey-v1.json (F-12), computed without the code under test: the public keys with
 * node:crypto (ECDH on prime256v1), and the signatures from RFC 6979, appendix A.2.5 (P-256 with
 * SHA-256, deterministic k), which node:crypto must verify before they are written. Dev only; run
 * with `bun packages/crypto/vectors/generate-passkey.ts`.
 */
import { createECDH, createPublicKey, verify } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const scalarHex = (value: bigint) => value.toString(16).padStart(64, "0");

/** The uncompressed public key of a scalar, by node:crypto */
const publicOf = (d: string) => {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(d, "hex"));
  return hex(ecdh.getPublicKey(null, "uncompressed"));
};

/** An integer of ASN.1 DER: minimal, with a zero byte in front of a set high bit */
const derInteger = (value: string) => {
  let bytes = Buffer.from(value, "hex");
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] as number) < 0x80)
    bytes = bytes.subarray(1);
  if ((bytes[0] as number) >= 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
};
const der = (r: string, s: string) => {
  const body = Buffer.concat([derInteger(r), derInteger(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
};

/** The SPKI of an uncompressed P-256 point, for node:crypto's verify */
const spki = (point: string) =>
  createPublicKey({
    key: Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
      Buffer.from(point, "hex"),
    ]),
    format: "der",
    type: "spki",
  });

const keys = [
  {
    name: "RFC 6979 A.2.5 key",
    d: "c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721",
  },
  { name: "smallest scalar (d = 1, the base point)", d: scalarHex(1n) },
  { name: "largest scalar (d = n - 1)", d: scalarHex(N - 1n) },
  { name: "scalar with a leading zero byte", d: `00${"5a".repeat(31)}` },
];

// RFC 6979, A.2.5, with SHA-256; the low-S form, which WebAuthn accepts and noble makes (lowS)
const RFC6979 = keys[0]?.d as string;
const signatures = [
  {
    message: "sample",
    r: "efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716",
    s: "f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8",
  },
  {
    message: "test",
    r: "f1abb023518351cd71d881567b1ea663ed3efcf6c5132b354f28d3b0b7d38367",
    s: "019f4113742a2b14bd25926b49c649155f267e60d3814b4c0cc84250e46f0083",
  },
].map(({ message, r, s }) => {
  const sValue = BigInt(`0x${s}`);
  const low = scalarHex(sValue > N / 2n ? N - sValue : sValue);
  const signature = der(r, low);
  const valid = verify("sha256", Buffer.from(message), spki(publicOf(RFC6979)), signature);
  if (!valid) throw new Error(`RFC 6979 signature for "${message}" does not verify`);
  return { message: hex(new TextEncoder().encode(message)), signature: hex(signature) };
});

writeFileSync(
  join(import.meta.dirname, "passkey-v1.json"),
  `${JSON.stringify(
    {
      keys: keys.map(({ name, d }) => ({ name, key: `01${d}`, publicKey: publicOf(d) })),
      signatures: { key: `01${RFC6979}`, cases: signatures },
      invalid: [
        { name: "unknown version", key: `02${RFC6979}`, error: "unknown-version" },
        { name: "version 0", key: `00${RFC6979}`, error: "unknown-version" },
        { name: "too short", key: `01${RFC6979.slice(2)}`, error: "invalid-key" },
        { name: "too long", key: `01${RFC6979}00`, error: "invalid-key" },
        { name: "zero scalar", key: `01${scalarHex(0n)}`, error: "invalid-key" },
        { name: "scalar n", key: `01${scalarHex(N)}`, error: "invalid-key" },
        { name: "scalar above n", key: `01${"ff".repeat(32)}`, error: "invalid-key" },
      ],
    },
    null,
    2,
  )}\n`,
);

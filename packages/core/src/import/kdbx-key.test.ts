import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compositeCandidates, keyFileKey } from "./kdbx-key.ts";
import { fixture } from "./test/helpers.ts";

const text = (value: string) => new TextEncoder().encode(value);
const sha256 = (data: Uint8Array | string) =>
  new Uint8Array(createHash("sha256").update(data).digest());
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const keyOf = (file: Uint8Array) => {
  const key = keyFileKey(file);
  return key.ok ? hex(key.value) : key.error;
};
const xmlKey = (version: string, data: string, hash?: string) =>
  text(
    `<?xml version="1.0"?>\n<KeyFile><Meta><Version>${version}</Version></Meta>` +
      `<Key><Data${hash === undefined ? "" : ` Hash="${hash}"`}>${data}</Data></Key></KeyFile>`,
  );

describe("key files", () => {
  it("reads KeePassXC's XML key file v2: hex in groups, checked against its hash", () => {
    expect(keyOf(fixture("keepassxc-keyfile.keyx"))).toBe(
      "f97656b38964f3171833750ab5b588dd4feeb5c08f6fe346e7c5cadce01a5a1e",
    );
    const data = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const hash = hex(sha256(Buffer.from(data, "hex")).subarray(0, 4));
    expect(keyOf(xmlKey("2.0", data, hash.toUpperCase()))).toBe(data);
    expect(keyOf(xmlKey("2.0", ` ${data.slice(0, 8)}\n\t${data.slice(8)} `, hash))).toBe(data);
  });

  it("pads a short key with zeros and cuts a long one to 32 bytes", () => {
    const short = "0102";
    expect(keyOf(xmlKey("2.0", short, hex(sha256(Buffer.from(short, "hex")).subarray(0, 4))))).toBe(
      `0102${"00".repeat(30)}`,
    );
    const long = "ab".repeat(40);
    expect(keyOf(xmlKey("2.0", long, hex(sha256(Buffer.from(long, "hex")).subarray(0, 4))))).toBe(
      "ab".repeat(32),
    );
  });

  it("reads the XML key file v1 with Base64", () => {
    const key = new Uint8Array(32).map((_, i) => i);
    expect(keyOf(xmlKey("1.00", Buffer.from(key).toString("base64")))).toBe(hex(key));
    expect(keyOf(fixture("kdbx-key-v1.key"))).toBe(hex(key));
  });

  it("refuses an XML key file that is broken", () => {
    const data = "0011223344556677";
    expect(keyOf(xmlKey("2.0", data, "00000000"))).toBe("bad-key-file");
    expect(keyOf(xmlKey("2.0", data))).toBe("bad-key-file");
    expect(keyOf(xmlKey("2.0", "0g", hex(sha256("")).slice(0, 8)))).toBe("bad-key-file");
    expect(keyOf(xmlKey("2.0", "001", "00000000"))).toBe("bad-key-file");
    // An odd number of hex digits, even with the hash of the whole bytes before it
    expect(keyOf(xmlKey("2.0", "001", hex(sha256(Uint8Array.of(0))).slice(0, 8)))).toBe(
      "bad-key-file",
    );
    expect(keyOf(xmlKey("2.00", data, hex(sha256(Buffer.from(data, "hex")).subarray(0, 4))))).toBe(
      "bad-key-file",
    );
    expect(keyOf(xmlKey("3.0", data))).toBe("bad-key-file");
    expect(keyOf(xmlKey("1.0", "nicht base64!"))).toBe("bad-key-file");
  });

  it("hashes an XML file that is no key file, or whose key is empty", () => {
    const v1 = Buffer.from(new Uint8Array(32).fill(4)).toString("base64");
    for (const file of [
      text(`<Other><Meta><Version>1.0</Version></Meta><Key><Data>${v1}</Data></Key></Other>`),
      text("<KeePassFile><Meta/></KeePassFile>"),
      xmlKey("2.0", "  "),
      text("<KeyFile><Meta><Version>2.0</Version></Meta></KeyFile>"),
      text("<KeyFile>"),
    ]) {
      expect(keyOf(file)).toBe(hex(sha256(file)));
    }
  });

  it("takes 32 bytes as they are and 64 hex characters as hex", () => {
    const raw = new Uint8Array(32).fill(0xa5);
    expect(keyOf(raw)).toBe(hex(raw));
    const hexKey = "0123456789abcdefABCDEF0123456789abcdef0123456789abcdef0123456789";
    expect(keyOf(text(hexKey))).toBe(hexKey.toLowerCase());
  });

  it("hashes any other file: other lengths, 64 characters that are not hex, not text", () => {
    const notHex = text("g".repeat(64));
    const notText = new Uint8Array(64).fill(0xff);
    for (const file of [
      new Uint8Array(31),
      new Uint8Array(33),
      notHex,
      notText,
      text("Weber"),
      text("abcd"),
    ]) {
      expect(keyOf(file)).toBe(hex(sha256(file)));
    }
  });

  it("copies a raw key, so wiping it leaves the file", () => {
    const raw = new Uint8Array(32).fill(1);
    const key = keyFileKey(raw);
    if (key.ok) key.value.fill(0);
    expect(raw).toEqual(new Uint8Array(32).fill(1));
  });
});

describe("composite key candidates", () => {
  const password = sha256("Weber");
  const empty = sha256("");
  const file = new Uint8Array(32).fill(2);

  it("takes the password alone, even an empty one", () => {
    expect(compositeCandidates({ password: "Weber" })).toEqual({ ok: true, value: [[password]] });
    expect(compositeCandidates({ password: "" })).toEqual({ ok: true, value: [[empty]] });
  });

  it("puts the password before the key file", () => {
    expect(compositeCandidates({ password: "Weber", keyFile: file })).toEqual({
      ok: true,
      value: [[password, file]],
    });
  });

  it("tries the key file alone first, then with an empty password", () => {
    expect(compositeCandidates({ password: "", keyFile: file })).toEqual({
      ok: true,
      value: [[file], [empty, file]],
    });
  });

  it("passes on a broken key file", () => {
    expect(compositeCandidates({ password: "x", keyFile: xmlKey("9", "00") })).toEqual({
      ok: false,
      error: "bad-key-file",
    });
  });
});

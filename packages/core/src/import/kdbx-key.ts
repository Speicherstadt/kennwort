/**
 * The composite key of a KeePass database (K-502 Teil 3) from its password and key file. A key
 * file is KeePass's XML key file (version 1.0 with Base64, 2.0 with hex and a checksum), 32 raw
 * bytes, 64 hex characters, or any other file, whose SHA-256 is the key. Sources:
 * keepassxreboot/keepassxc, src/keys/FileKey.cpp (load, loadXml, loadBinary, loadHex,
 * loadHashed), src/keys/PasswordKey.cpp and src/keys/CompositeKey.cpp; KeePassXC's
 * DatabaseOpenWidget for the empty password.
 */
import { kdbxPasswordPart, type Result, sha256 } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import { fromBase64 } from "./base64.ts";
import { decodeText } from "./text.ts";
import type { ImportKey } from "./types.ts";
import { child, childText, parseXml } from "./xml.ts";

const KEY_LENGTH = 32;
const HEX = /^[0-9a-fA-F]*$/;

const fromHex = (text: string) =>
  Uint8Array.from({ length: text.length / 2 }, (_, i) =>
    Number.parseInt(text.slice(2 * i, 2 * i + 2), 16),
  );

const hexOf = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** The first 32 bytes, padded with zeros, as KeePassXC copies the XML key file's data */
const first32 = (data: Uint8Array) => {
  const key = new Uint8Array(KEY_LENGTH);
  key.set(data.subarray(0, KEY_LENGTH));
  return key;
};

/** The data of an XML key file: v1 Base64, v2 hex whose SHA-256 starts with the `Hash` attribute */
const xmlKeyData = (
  version: string,
  data: string,
  hash: string | undefined,
): Uint8Array | undefined => {
  if (version.startsWith("1.0")) return fromBase64(data);
  if (version !== "2.0" || !HEX.test(data) || data.length % 2 !== 0) return undefined;
  const bytes = fromHex(data);
  return hash?.toLowerCase() === hexOf(sha256(bytes).subarray(0, 4)) ? bytes : undefined;
};

/**
 * The key of an XML key file; `undefined` if the file is no `KeyFile` document at all, so the
 * other forms are tried (FileKey::load). One that is but is broken is `bad-key-file`.
 */
const xmlKey = (file: Uint8Array): Result<Uint8Array, "bad-key-file"> | undefined => {
  const text = decodeText(file);
  const xml = text.ok ? parseXml(text.value) : undefined;
  if (!xml?.ok || xml.value.name !== "KeyFile") return undefined;
  const version = childText(child(xml.value, "Meta"), "Version");
  const node = child(child(xml.value, "Key"), "Data");
  if (!node) return undefined;
  const data = node.text.replace(/\s/g, "");
  if (data === "") return undefined;
  const bytes = xmlKeyData(version, data, node.attributes.get("Hash"));
  return bytes ? ok(first32(bytes)) : err("bad-key-file");
};

/** The key a key file stands for, in the order KeePassXC tries the forms */
export const keyFileKey = (file: Uint8Array): Result<Uint8Array, "bad-key-file"> => {
  const xml = xmlKey(file);
  if (xml) return xml;
  if (file.length === KEY_LENGTH) return ok(file.slice());
  const text = file.length === 2 * KEY_LENGTH ? decodeText(file) : undefined;
  if (text?.ok && HEX.test(text.value)) return ok(fromHex(text.value));
  return ok(sha256(file));
};

/**
 * The lists of parts to try, password first. An empty password with a key file means none, as in
 * KeePassXC, but KeePass 2 lets one be set; so that is tried second. Without a key file the empty
 * password is the only part there can be.
 */
export const compositeCandidates = (key: ImportKey): Result<Uint8Array[][], "bad-key-file"> => {
  if (key.keyFile === undefined) return ok([[kdbxPasswordPart(key.password)]]);
  const file = keyFileKey(key.keyFile);
  if (!file.ok) return file;
  const password = kdbxPasswordPart(key.password);
  return ok(
    key.password === "" ? [[file.value], [password, file.value]] : [[password, file.value]],
  );
};

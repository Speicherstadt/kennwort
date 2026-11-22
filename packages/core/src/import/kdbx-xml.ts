/**
 * The protected values of a KDBX 4 database's XML (K-502 Teil 3): each element marked
 * `Protected="True"` holds Base64 of its value XORed with the inner stream, which runs on through
 * the document in order. Sources: keepassxreboot/keepassxc, src/format/KdbxXmlReader.cpp
 * (readString, readBinary, isTrueValue). What comes out is marked `ProtectInMemory`, as the XML
 * export marks it, so the KeePass XML parser keeps it secret.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import { fromBase64 } from "./base64.ts";
import type { XmlElement } from "./xml.ts";

/** How KeePass writes yes in an attribute (KdbxXmlReader::isTrueValue) */
const TRUE = /^(true|1)$/i;
const utf8 = new TextDecoder();

/** The elements in document order, without recursion */
const inOrder = (root: XmlElement): XmlElement[] => {
  const found: XmlElement[] = [];
  const pending = [root];
  for (let next = pending.pop(); next; next = pending.pop()) {
    found.push(next);
    // One by one: spreading a huge list of children into push would overflow the call stack
    for (let i = next.children.length - 1; i >= 0; i--)
      pending.push(next.children[i] as XmlElement);
  }
  return found;
};

/**
 * Every protected value replaced by its plain text, in place. `keystream(length)` gives the inner
 * stream's first bytes; one call covers all values, as an empty one takes nothing from it.
 */
export const unprotect = (
  root: XmlElement,
  keystream: (length: number) => Uint8Array,
): Result<XmlElement, "bad-kdbx"> => {
  const hidden = inOrder(root).filter((node) =>
    TRUE.test(String(node.attributes.get("Protected"))),
  );
  const values = hidden.map((node) => fromBase64(node.text.replace(/\s/g, "")));
  if (values.some((value) => value === undefined)) return err("bad-kdbx");
  const bytes = values as Uint8Array[];
  const stream = keystream(bytes.reduce((sum, value) => sum + value.length, 0));
  let at = 0;
  hidden.forEach((node, index) => {
    const value = bytes[index] as Uint8Array;
    node.text = utf8.decode(value.map((byte, i) => byte ^ (stream[at + i] as number)));
    at += value.length;
    node.attributes.delete("Protected");
    node.attributes.set("ProtectInMemory", "True");
  });
  return ok(root);
};

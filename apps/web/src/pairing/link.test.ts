import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { pairingLink, readPairingLink } from "./link.ts";

const fingerprint = new Uint8Array(32).fill(1);
const secret = new Uint8Array(32).fill(2);
const pairing = { id: "AbC_-123", fingerprint, secret };

describe("the pairing link", () => {
  it("puts ID, fingerprint and secret in the fragment of the server's /link page", () => {
    const link = pairingLink("https://kennwort.weber-haustechnik.de/", pairing);
    const url = new URL(link);
    expect(url.pathname).toBe("/link");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("r")).toBe(encodeBytes(secret));
  });

  it("reads back what it wrote, from the whole link or just the fragment", () => {
    const link = pairingLink("https://kennwort.weber-haustechnik.de", pairing);
    expect(readPairingLink(link)).toEqual(pairing);
    expect(readPairingLink(new URL(link).hash)).toEqual(pairing);
    expect(readPairingLink(`  ${link}\n`)).toEqual(pairing);
  });

  // Review of K-303 (part 4): the QR parser checks the lengths, so core never throws on a bad code
  it("refuses a link with a part missing or of the wrong length", () => {
    const fp = encodeBytes(fingerprint);
    const r = encodeBytes(secret);
    for (const hash of [
      `#fp=${fp}&r=${r}`,
      `#id=x&r=${r}`,
      `#id=x&fp=${fp}`,
      `#id=x&fp=${encodeBytes(new Uint8Array(31))}&r=${r}`,
      `#id=x&fp=${fp}&r=${encodeBytes(new Uint8Array(33))}`,
      `#id=x&fp=nicht-base64!&r=${r}`,
      "irgendwas",
      "",
    ])
      expect(readPairingLink(hash)).toBeUndefined();
  });
});

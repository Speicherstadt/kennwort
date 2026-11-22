/**
 * Bytes as lower-case hex and back, for the tags of the phishing warning (K-405). A module of its
 * own so the content script, which needs only this, does not pull in the entries' code.
 */
export const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const fromHex = (text: string) =>
  Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

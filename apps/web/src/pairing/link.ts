/**
 * The link the new device's QR code holds (P-04): pairing ID, the fingerprint of its one-time key
 * and the pairing secret, all in the fragment of the server's /link page, which no server sees.
 * A camera app opens it on the unlocked device; it can also be pasted. Reading checks every
 * length, so a malformed code becomes "not a pairing link" and never reaches the crypto.
 */
import { bytes, encodeBytes } from "@kennwort/core";

export type PairingLink = { id: string; fingerprint: Uint8Array; secret: Uint8Array };

export const pairingLink = (origin: string, pairing: PairingLink) =>
  `${origin.replace(/\/+$/, "")}/link#${new URLSearchParams({
    id: pairing.id,
    fp: encodeBytes(pairing.fingerprint),
    r: encodeBytes(pairing.secret),
  })}`;

const fragmentOf = (text: string) => {
  const trimmed = text.trim();
  const at = trimmed.indexOf("#");
  return at === -1 ? trimmed : trimmed.slice(at + 1);
};

export const readPairingLink = (text: string): PairingLink | undefined => {
  const params = new URLSearchParams(fragmentOf(text));
  const id = params.get("id");
  const fingerprint = bytes(32).safeParse(params.get("fp"));
  const secret = bytes(32).safeParse(params.get("r"));
  return id && fingerprint.success && secret.success
    ? { id, fingerprint: fingerprint.data, secret: secret.data }
    : undefined;
};

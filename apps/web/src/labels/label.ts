/**
 * QR labels for a device or an installation (K-605, docs/sicherheitsdesign.md P-27): a sticker on
 * the heating's router that leads to its entry. The code holds the entry's address in the app
 * (P-26: IDs only, opened after unlocking and only for an account that may read it), never a
 * password, a user name or a title: whoever photographs the label learns the IDs and nothing else.
 * The code is made on the device (uqr, apps/web/src/pairing/qr.ts); nothing goes to the server.
 */

const ID = /^[A-Za-z0-9_-]{22}$/;

/** The label sizes of common label printers, in millimetres; each has a print page of its own */
export const LABEL_SIZES = [
  { id: "62x29", width: 62, height: 29 },
  { id: "89x36", width: 89, height: 36 },
  { id: "50x50", width: 50, height: 50 },
] as const;
export type LabelSize = (typeof LABEL_SIZES)[number]["id"];

/** At most this many characters of the caption fit on the smallest label */
export const CAPTION_MAX = 40;

/**
 * The address a label's code holds: the app's https address of the entry, so any phone camera
 * opens it; undefined for anything that is not two IDs or not an http(s) origin
 */
export const labelLink = (origin: string, vaultId: string, entryId: string) => {
  const url = URL.parse(origin);
  if (!url || !["https:", "http:"].includes(url.protocol)) return undefined;
  if (!ID.test(vaultId) || !ID.test(entryId)) return undefined;
  return `${url.origin}/vaults/${vaultId}/${entryId}`;
};

/** The caption printed beside the code: what the person typed, trimmed and cut to fit */
export const caption = (text: string) => text.trim().slice(0, CAPTION_MAX);

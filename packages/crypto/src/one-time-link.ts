/**
 * F-15 of docs/sicherheitsdesign.md: the ciphertext of a one-time link (K-601, P-18). The client
 * draws a fresh 256-bit link secret, which goes into the link's fragment only; the server keeps
 * the ciphertext and never sees the secret. An optional passphrase, sent on another channel, adds
 * Argon2id on top, as Bitwarden Send's optional password does.
 *
 *   without passphrase:  key = kdf(secret, empty, "kennwort/link/v1", 0x00)
 *                        link = 0x01 ‖ 0x00 ‖ F-01(key, plaintext, purpose "link", context 0x00)
 *   with passphrase:     p₁   = Argon2id(NFKC(passphrase), salt (16 bytes)), m = 64 MiB, t = 3, p = 1
 *                        key  = kdf(secret, p₁, "kennwort/link/v1", 0x01, salt)
 *                        link = 0x01 ‖ 0x01 ‖ salt ‖ F-01(key, plaintext, purpose "link", context 0x01, salt)
 *
 * The kind byte is in the key's derivation and the box's AAD: a server that strips the passphrase
 * flag gets a ciphertext no key opens. The Argon2id parameters belong to the version (as in F-05
 * and F-13), so a link cannot make the recipient's device work harder, nor can a server lower them.
 */
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { NONCE_LENGTH, open, sealWithNonce } from "./box.ts";
import { kdf } from "./derive.ts";
import type { ArgonParams } from "./passphrase.ts";
import { randomBytes } from "./random.ts";
import { err, ok, type Result } from "./result.ts";

export const LINK_V1 = 0x01;
export const LINK_SECRET_LENGTH = 32;
export const LINK_SALT_LENGTH = 16;
export const LINK_ARGON2_V1: ArgonParams = Object.freeze({ m: 64 * 1024, t: 3, p: 1 });
const PLAIN = 0x00;
const PROTECTED = 0x01;
const PURPOSE = "link";
const LABEL = "kennwort/link/v1";
/** The box itself: version, nonce and tag around an empty plaintext */
const BOX_MINIMUM = 1 + NONCE_LENGTH + 16;

export type LinkOpenError =
  | "too-short"
  | "unknown-version"
  | "unknown-kind"
  | "needs-passphrase"
  | "wrong-secret";

/** Version, kind and salt as one link starts; the passphrase decides the kind */
const header = (salt: Uint8Array | undefined) =>
  salt ? Uint8Array.of(LINK_V1, PROTECTED, ...salt) : Uint8Array.of(LINK_V1, PLAIN);

/** A passphrase and the salt it is stretched with */
type Protection = { text: string; salt: Uint8Array };

const linkKey = async (params: ArgonParams, secret: Uint8Array, protection?: Protection) => {
  if (!protection) return kdf(secret, new Uint8Array(), LABEL, Uint8Array.of(PLAIN));
  const { text, salt } = protection;
  const p1 = await argon2idAsync(text.normalize("NFKC"), salt, { ...params, dkLen: 32 });
  return kdf(secret, p1, LABEL, Uint8Array.of(PROTECTED), salt);
};

const contextOf = (salt: Uint8Array | undefined) =>
  salt ? [Uint8Array.of(PROTECTED), salt] : [Uint8Array.of(PLAIN)];

export type LinkSealInput = {
  secret: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  /** Present for a link with a passphrase, with the salt for it */
  passphrase?: Protection | undefined;
};

/** With given parameters, secret, salt and nonce; only for test vectors and tests */
export const sealLinkWith = async (
  params: ArgonParams,
  { secret, nonce, plaintext, passphrase }: LinkSealInput,
): Promise<Uint8Array> => {
  if (secret.length !== LINK_SECRET_LENGTH) throw new RangeError("link secret must be 32 bytes");
  const salt = passphrase?.salt;
  if (salt && salt.length !== LINK_SALT_LENGTH) throw new RangeError("link salt must be 16 bytes");
  if (passphrase?.text === "") throw new RangeError("link passphrase must not be empty");
  // A lone surrogate would become U+FFFD and two passphrases one (as in encode, F-04)
  if (passphrase && !passphrase.text.isWellFormed()) throw new RangeError("not well-formed text");
  const key = await linkKey(params, secret, passphrase);
  const box = sealWithNonce(key, nonce, plaintext, { purpose: PURPOSE, context: contextOf(salt) });
  const start = header(salt);
  const link = new Uint8Array(start.length + box.length);
  link.set(start);
  link.set(box, start.length);
  return link;
};

/** A fresh link: a new secret for the fragment, and the ciphertext for the server */
export const sealLink = async (
  plaintext: Uint8Array,
  passphrase?: string,
): Promise<{ secret: Uint8Array; link: Uint8Array }> => {
  const secret = randomBytes(LINK_SECRET_LENGTH);
  const link = await sealLinkWith(LINK_ARGON2_V1, {
    secret,
    nonce: randomBytes(NONCE_LENGTH),
    plaintext,
    passphrase:
      passphrase === undefined
        ? undefined
        : { text: passphrase, salt: randomBytes(LINK_SALT_LENGTH) },
  });
  return { secret, link };
};

type Parsed = { salt: Uint8Array | undefined; box: Uint8Array };

/** Version, kind and length, checked before any key is derived */
const parseLink = (link: Uint8Array): Result<Parsed, LinkOpenError> => {
  const version = link[0];
  if (version === undefined) return err("too-short");
  if (version !== LINK_V1) return err("unknown-version");
  const kind = link[1];
  if (kind === undefined) return err("too-short");
  if (kind !== PLAIN && kind !== PROTECTED) return err("unknown-kind");
  const start = kind === PROTECTED ? 2 + LINK_SALT_LENGTH : 2;
  if (link.length < start + BOX_MINIMUM) return err("too-short");
  const salt = kind === PROTECTED ? link.subarray(2, start) : undefined;
  return ok({ salt, box: link.subarray(start) });
};

/** Whether a link asks for a passphrase; undefined for bytes that are no link of a known version */
export const linkNeedsPassphrase = (link: Uint8Array): boolean | undefined => {
  const parsed = parseLink(link);
  return parsed.ok ? parsed.value.salt !== undefined : undefined;
};

/** With given Argon2id parameters; only for tests */
export const openLinkWith = async (
  params: ArgonParams,
  secret: Uint8Array,
  link: Uint8Array,
  passphrase?: string,
): Promise<Result<Uint8Array, LinkOpenError>> => {
  const parsed = parseLink(link);
  if (!parsed.ok) return parsed;
  const { salt, box } = parsed.value;
  let protection: Protection | undefined;
  if (salt) {
    if (passphrase === undefined) return err("needs-passphrase");
    // A lone surrogate must not open what U+FFFD sealed (as in F-13)
    if (!passphrase.isWellFormed()) return err("wrong-secret");
    protection = { text: passphrase, salt };
  }
  // A secret of another length derives another key and fails at the tag like any wrong one
  const key = await linkKey(params, secret, protection);
  const opened = open(key, box, { purpose: PURPOSE, context: contextOf(salt) });
  return opened.ok ? ok(opened.value) : err("wrong-secret");
};

export const openLink = (secret: Uint8Array, link: Uint8Array, passphrase?: string) =>
  openLinkWith(LINK_ARGON2_V1, secret, link, passphrase);

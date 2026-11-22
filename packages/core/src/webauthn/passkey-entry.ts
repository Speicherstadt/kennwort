/**
 * A passkey as an entry (K-406, F-12 in docs/sicherheitsdesign.md): an entry of type "passkey"
 * whose fields have fixed IDs, all in the entry's one ciphertext like every other field (P-09):
 *
 *   rp-id          the relying party's ID, which an assertion must name exactly
 *   username       user.name of the registration, display-name its user.displayName
 *   user-handle    user.id (base64url), which an assertion returns
 *   credential-id  the credential's ID (base64url), 16 random bytes
 *   private-key    the F-12 key (base64url), a secret field: search and lists never show it
 *   counter        always "0" (credential.ts)
 *
 * No address field: a passkey is found by its rpId, never offered to fill a login form.
 */
import { bytes, encodeBytes } from "../sync/bytes.ts";
import type { EntryContent, Field } from "../sync/content.ts";
import { PASSKEY_COUNTER } from "./credential.ts";

export const CREDENTIAL_ID_LENGTH = 16;
/** WebAuthn §5.4.3: user.id is at most 64 bytes */
export const MAX_USER_HANDLE = 64;

export type Passkey = {
  rpId: string;
  username: string;
  displayName: string;
  userHandle: Uint8Array;
  credentialId: Uint8Array;
  /** The F-12 key */
  key: Uint8Array;
};

/** What a registration asked for, and the key and ID made for it */
export type NewPasskey = Passkey & { rpName: string };

const field = (id: string, value: string, kind: Field["kind"] = "text"): Field => ({
  id,
  name: id,
  value,
  kind,
});

/** The content of a new passkey entry; its title is the relying party's name, else its rpId */
export const passkeyContent = (passkey: NewPasskey): EntryContent => ({
  type: "passkey",
  title: passkey.rpName.trim() || passkey.rpId,
  fields: [
    field("rp-id", passkey.rpId),
    field("username", passkey.username),
    field("display-name", passkey.displayName),
    field("user-handle", encodeBytes(passkey.userHandle)),
    field("credential-id", encodeBytes(passkey.credentialId)),
    field("private-key", encodeBytes(passkey.key), "secret"),
    field("counter", String(PASSKEY_COUNTER)),
  ],
  tags: [],
  favorite: false,
  history: [],
});

const decoded = (text: string | undefined) => {
  const parsed = bytes().safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

/** The passkey in an entry's content, or undefined for any other entry or a broken one */
export const passkeyOf = (content: EntryContent): Passkey | undefined => {
  if (content.type !== "passkey") return undefined;
  const value = (id: string) => content.fields.find((f) => f.id === id)?.value;
  const rpId = value("rp-id");
  const userHandle = decoded(value("user-handle"));
  const credentialId = decoded(value("credential-id"));
  const key = decoded(value("private-key"));
  if (!rpId || !userHandle || userHandle.length > MAX_USER_HANDLE) return undefined;
  if (!credentialId || credentialId.length === 0 || !key || key.length === 0) return undefined;
  return {
    rpId,
    username: value("username") ?? "",
    displayName: value("display-name") ?? "",
    userHandle,
    credentialId,
    key,
  };
};

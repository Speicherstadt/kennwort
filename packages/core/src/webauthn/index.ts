// Kennwort as a WebAuthn authenticator for websites (K-406): the structures and the passkey entry

export {
  AAGUID,
  ASSERTION_FLAGS,
  type Attested,
  attestationObject,
  authenticatorData,
  type ClientData,
  clientDataJSON,
  coseKey,
  FLAGS,
  REGISTRATION_FLAGS,
  signedMessage,
  spkiKey,
} from "./authenticator.ts";
export { type CborValue, cbor } from "./cbor.ts";
export {
  type AssertionJSON,
  assertion,
  type Ceremony,
  PASSKEY_COUNTER,
  type RegistrationJSON,
  registration,
  TRANSPORTS,
} from "./credential.ts";
export {
  CREDENTIAL_ID_LENGTH,
  MAX_USER_HANDLE,
  type NewPasskey,
  type Passkey,
  passkeyContent,
  passkeyOf,
} from "./passkey-entry.ts";

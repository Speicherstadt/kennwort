/**
 * A passkey's registration and assertion as the JSON of WebAuthn Level 3 (§5.1, toJSON():
 * RegistrationResponseJSON and AuthenticationResponseJSON), every byte string as base64url. The
 * extension's prompt makes them after the user's click (K-406); the script in the page turns them
 * into a PublicKeyCredential, and a relying party such as SimpleWebAuthn checks them as it checks any
 * authenticator's. The counter stays 0: the passkey is synced between devices, which cannot keep a
 * shared counter, and 0 tells the relying party there is none (§6.1.1), as with the passkeys of
 * Apple, Google and Bitwarden.
 */
import { ES256, type PasskeyKeyError, passkeyPublicKey, passkeySign } from "@kennwort/crypto";
import type { Result } from "../result.ts";
import { encodeBytes } from "../sync/bytes.ts";
import {
  ASSERTION_FLAGS,
  attestationObject,
  authenticatorData,
  clientDataJSON,
  REGISTRATION_FLAGS,
  signedMessage,
  spkiKey,
} from "./authenticator.ts";

/** The counter of every passkey Kennwort keeps (see above) */
export const PASSKEY_COUNTER = 0;
/** Where a synced passkey can be used: on this device, or from a phone (hybrid) */
export const TRANSPORTS = ["hybrid", "internal"] as const;

/** The ceremony the service worker checked: where it runs, for which rpId, with whose challenge */
export type Ceremony = { origin: string; rpId: string; challenge: Uint8Array };

export type RegistrationJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment: "platform";
  clientExtensionResults: Record<string, never>;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData: string;
    publicKey: string;
    publicKeyAlgorithm: number;
    transports: string[];
  };
};

export type AssertionJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment: "platform";
  clientExtensionResults: Record<string, never>;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string;
  };
};

const common = (credentialId: Uint8Array) => {
  const id = encodeBytes(credentialId);
  return {
    id,
    rawId: id,
    type: "public-key" as const,
    authenticatorAttachment: "platform" as const,
    clientExtensionResults: {},
  };
};

/** The registration of a new passkey with this F-12 key, attestation "none" */
export const registration = (
  ceremony: Ceremony,
  credentialId: Uint8Array,
  key: Uint8Array,
): Result<RegistrationJSON, PasskeyKeyError> => {
  const publicKey = passkeyPublicKey(key);
  if (!publicKey.ok) return publicKey;
  const authData = authenticatorData(ceremony.rpId, REGISTRATION_FLAGS, PASSKEY_COUNTER, {
    credentialId,
    publicKey: publicKey.value,
  });
  const clientData = clientDataJSON({
    type: "webauthn.create",
    challenge: encodeBytes(ceremony.challenge),
    origin: ceremony.origin,
  });
  return {
    ok: true,
    value: {
      ...common(credentialId),
      response: {
        clientDataJSON: encodeBytes(clientData),
        attestationObject: encodeBytes(attestationObject(authData)),
        authenticatorData: encodeBytes(authData),
        publicKey: encodeBytes(spkiKey(publicKey.value)),
        publicKeyAlgorithm: ES256,
        transports: [...TRANSPORTS],
      },
    },
  };
};

/** The assertion of a sign-in with a stored passkey, signed with its F-12 key */
export const assertion = (
  ceremony: Ceremony,
  credentialId: Uint8Array,
  userHandle: Uint8Array,
  key: Uint8Array,
): Result<AssertionJSON, PasskeyKeyError> => {
  const authData = authenticatorData(ceremony.rpId, ASSERTION_FLAGS, PASSKEY_COUNTER);
  const clientData = clientDataJSON({
    type: "webauthn.get",
    challenge: encodeBytes(ceremony.challenge),
    origin: ceremony.origin,
  });
  const signature = passkeySign(key, signedMessage(authData, clientData));
  if (!signature.ok) return signature;
  return {
    ok: true,
    value: {
      ...common(credentialId),
      response: {
        clientDataJSON: encodeBytes(clientData),
        authenticatorData: encodeBytes(authData),
        signature: encodeBytes(signature.value),
        userHandle: encodeBytes(userHandle),
      },
    },
  };
};

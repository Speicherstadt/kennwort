/**
 * What the passkey prompt does (K-406), each after a click that counts (bridge.ts: delivered by
 * the browser while the prompt was visible, uncovered and opaque, and clear in the page): save a new
 * passkey, or sign in with a stored one. Saving makes an F-12 key and a random credential ID,
 * writes the passkey through the web app's entry store (encrypted, signed, bound to entry, vault and
 * version, P-09) and only then answers the page with the registration. Signing reads the key from
 * the decrypted entry, signs and wipes its copy. "Anderes Gerät verwenden" hands the ceremony to the
 * browser's own WebAuthn, × ends it; neither needs the checks, since neither signs anything.
 */
import type { EntryStore } from "@kennwort/client/entries/entry-store.ts";
import { bytes } from "@kennwort/core";
import {
  assertion,
  type Ceremony as CoreCeremony,
  CREDENTIAL_ID_LENGTH,
  passkeyContent,
  passkeyOf,
  registration,
} from "@kennwort/core/webauthn";
import { newPasskeyKey, randomBytes } from "@kennwort/crypto";
import { m } from "@kennwort/ui";
import { createSignal } from "solid-js";
import type { VisibilityGuard } from "../menu/visibility.ts";
import type { Ceremony, PasskeyAnswer } from "../passkey/messages.ts";
import { confirmed, type PromptBridge } from "./bridge.ts";

export type PasskeyActionDeps = {
  ceremony: Ceremony;
  bridge: PromptBridge;
  guard: VisibilityGuard;
  store: EntryStore | undefined;
  /** A note over the prompt (why nothing happened), or none */
  onNote: (note: string | undefined) => void;
  /** The ceremony's end: the answer the page gets */
  onAnswer: (answer: PasskeyAnswer) => void;
};

const decoded = (text: string) => {
  const parsed = bytes().safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

/** The ceremony as packages/core takes it, with the challenge as bytes */
const coreCeremony = (ceremony: Ceremony): CoreCeremony | undefined => {
  const challenge = decoded(ceremony.challenge);
  return challenge && { origin: ceremony.origin, rpId: ceremony.rpId, challenge };
};

export const createPasskeyActions = (deps: PasskeyActionDeps) => {
  const [busy, setBusy] = createSignal(false);
  let running = false;

  /** Runs after a click that counts; says why not otherwise */
  const act = async (event: Event, run: () => Promise<PasskeyAnswer | undefined>) => {
    if (running) return;
    running = true;
    setBusy(true);
    try {
      if (!(await confirmed(deps.bridge, deps.guard, event)))
        return deps.onNote(m.passkey_prompt_hidden());
      deps.onNote(undefined);
      const answer = await run();
      if (answer) deps.onAnswer(answer);
      else deps.onNote(m.passkey_prompt_failed());
    } finally {
      running = false;
      setBusy(false);
    }
  };

  const save = async (vaultIdText: string): Promise<PasskeyAnswer | undefined> => {
    const ceremony = deps.ceremony;
    const checked = coreCeremony(ceremony);
    const userHandle = ceremony.kind === "create" ? decoded(ceremony.user.id) : undefined;
    if (ceremony.kind !== "create" || !checked || !userHandle || !deps.store) return undefined;
    const key = newPasskeyKey();
    try {
      const credentialId = randomBytes(CREDENTIAL_ID_LENGTH);
      const made = registration(checked, credentialId, key);
      if (!made.ok) return undefined;
      const content = passkeyContent({
        rpId: ceremony.rpId,
        rpName: ceremony.rpName,
        username: ceremony.user.name,
        displayName: ceremony.user.displayName,
        userHandle,
        credentialId,
        key,
      });
      const saved = await deps.store.save(vaultIdText, content);
      return saved.ok ? { outcome: "credential", credential: made.value } : undefined;
    } finally {
      key.fill(0);
    }
  };

  const sign = async (entryId: string): Promise<PasskeyAnswer | undefined> => {
    const ceremony = deps.ceremony;
    const checked = coreCeremony(ceremony);
    const stored = deps.store?.entries().find((entry) => entry.idText === entryId);
    const passkey = stored && passkeyOf(stored.content);
    // The rpId once more: only a passkey for exactly this relying party signs
    if (ceremony.kind !== "get" || !checked || !passkey || passkey.rpId !== ceremony.rpId)
      return undefined;
    try {
      const signed = assertion(checked, passkey.credentialId, passkey.userHandle, passkey.key);
      return signed.ok ? { outcome: "credential", credential: signed.value } : undefined;
    } finally {
      passkey.key.fill(0);
    }
  };

  return {
    busy,
    save: (event: Event, vaultIdText: string) => act(event, () => save(vaultIdText)),
    sign: (event: Event, entryId: string) => act(event, () => sign(entryId)),
    otherDevice: () => deps.onAnswer({ outcome: "fallback" }),
    cancel: () => deps.onAnswer({ outcome: "error", name: "NotAllowedError" }),
  };
};

export type PasskeyActions = ReturnType<typeof createPasskeyActions>;

import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { encodeBytes } from "@kennwort/core";
import type { AssertionJSON, RegistrationJSON } from "@kennwort/core/webauthn";
import { coseKey, passkeyContent, passkeyOf } from "@kennwort/core/webauthn";
import { newPasskeyKey, passkeyPublicKey } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase, PopupAccount } from "../account/popup-account.ts";
import type { Ceremony, PasskeyAnswer } from "../passkey/messages.ts";
import type { PromptRequest, SaveAnswer } from "../save/messages.ts";
import type { PromptBridge } from "./bridge.ts";
import { PasskeyPrompt } from "./passkey-prompt.tsx";

// K-406: the passkey prompt saves a passkey or signs in with one only after a click the browser
// delivered while it was visible and clear; locked, without a match or on "Anderes Gerät
// verwenden" the ceremony goes to the browser's own WebAuthn. What it answers passes
// SimpleWebAuthn's verification.
const loaded = vi.hoisted(() => ({
  entries: [] as StoredEntry[],
  vaults: [] as unknown[],
  save: vi.fn(),
}));
vi.mock("@kennwort/client/policy/policy.ts", () => ({ applyPolicy: vi.fn() }));
vi.mock("@kennwort/client/vaults/vaults.ts", () => ({
  loadVaults: async () => ({
    ok: true,
    value: { vaults: loaded.vaults, refused: [], people: [], trust: {} },
  }),
}));
vi.mock("@kennwort/client/entries/entry-store.ts", () => ({
  httpServerFor: () => () => ({}),
  createEntryStore: () => {
    const [entries, setEntries] = createSignal<StoredEntry[]>([]);
    return {
      load: async () => setEntries(loaded.entries),
      entries,
      save: async (vaultIdText: string, content: StoredEntry["content"]) => {
        const saved = await loaded.save(vaultIdText, content);
        if (saved.ok)
          setEntries([
            ...entries(),
            { idText: saved.value, vaultIdText, role: "edit", version: 1, content },
          ]);
        return saved;
      },
    };
  },
}));

const NONCE = "ab".repeat(16);
const ORIGIN = "https://portal.weber-haustechnik.test";
const RP = "weber-haustechnik.test";
const CHALLENGE = "q83vEjRWeJAAAQIDBAUGBw";
const vault = (idText: string, name: string, role = "edit") => ({
  idText,
  name,
  role,
  log: { rotationDue: false },
});

const createCeremony: Ceremony = {
  kind: "create",
  origin: ORIGIN,
  rpId: RP,
  rpName: "Weber Portal",
  user: { id: "AQID", name: "jonas.weber", displayName: "Jonas Weber" },
  challenge: CHALLENGE,
  algorithms: [-7],
  exclude: [],
};
const getCeremony = (allow: string[] = [], rpId = RP): Ceremony => ({
  kind: "get",
  origin: ORIGIN,
  rpId,
  challenge: CHALLENGE,
  allow,
  userVerification: "required",
});

const storedPasskey = (idText: string, username: string, rpId = RP) => {
  const key = newPasskeyKey();
  const credentialId = Uint8Array.from({ length: 16 }, (_, i) => i + idText.length);
  const entry: StoredEntry = {
    idText,
    vaultIdText: "buero",
    role: "edit",
    version: 1,
    content: passkeyContent({
      rpId,
      rpName: "Weber Portal",
      username,
      displayName: "",
      userHandle: Uint8Array.of(7, 7),
      credentialId,
      key,
    }),
  };
  const publicKey = passkeyPublicKey(key);
  if (!publicKey.ok) throw new Error(publicKey.error);
  return {
    entry,
    credentialId: encodeBytes(credentialId),
    cose: new Uint8Array(coseKey(publicKey.value)),
  };
};

const observerReporting = (isVisible: boolean) =>
  class {
    constructor(
      private report: (
        r: { isVisible: boolean; intersectionRatio: number; time: number }[],
      ) => void,
    ) {}
    observe() {
      this.report([{ isVisible, intersectionRatio: 1, time: 0 }]);
    }
    disconnect() {}
  };

let dispose = () => {};
beforeEach(() => {
  setLocale("de", { reload: false });
  loaded.entries = [];
  loaded.vaults = [vault("buero", "Büro"), vault("bau", "Baustellen-Tablets")];
  loaded.save = vi.fn(async () => ({ ok: true, value: "new-id" }));
});
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
};

const show = async (
  ceremony: Ceremony,
  options: { phase?: Phase; visible?: boolean; trusted?: boolean; clear?: boolean } = {},
) => {
  const requests: PromptRequest[] = [];
  const answers: PasskeyAnswer[] = [];
  const bridge: PromptBridge = {
    nonce: NONCE,
    request: async (request): Promise<SaveAnswer> => {
      requests.push(request);
      return { ok: request.type === "prompt-check" ? (options.clear ?? true) : true } as SaveAnswer;
    },
    now: () => 60_000,
    verifiable: true,
    trusted: () => options.trusted ?? true,
    wait: async () => {},
    Observer: observerReporting(options.visible ?? true),
  };
  const account = {
    phase: () => options.phase ?? "open",
    restore: vi.fn(async () => {}),
    api: () => ({ syncFetch: fetch }),
    opened: () => undefined,
  } as unknown as PopupAccount;
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => (
      <PasskeyPrompt
        account={account}
        ceremony={ceremony}
        bridge={bridge}
        onAnswer={(a) => answers.push(a)}
      />
    ),
    root,
  );
  await settle();
  return { types: () => requests.map((r) => r.type), answers };
};

const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent === name);
const click = async (name: string) => {
  const found = button(name);
  if (!found) throw new Error(`no button ${name}`);
  found.click();
  await settle();
};

describe("the passkey prompt saves a passkey", () => {
  it("into the chosen vault after a click that counts, and answers a registration SimpleWebAuthn accepts", async () => {
    const { types, answers } = await show(createCeremony);
    expect(types()).toContain("prompt-show");
    expect(document.body.textContent).toContain("Passkey in Kennwort speichern?");
    expect(document.body.textContent).toContain(`für ${RP}`);
    expect(document.body.textContent).toContain("jonas.weber");
    expect(document.querySelector("header")?.textContent).toContain(
      "portal.weber-haustechnik.test",
    );
    const select = document.querySelector("select") as HTMLSelectElement;
    select.value = "bau";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await click("Passkey speichern");
    expect(types()).toContain("prompt-check");
    expect(loaded.save).toHaveBeenCalledOnce();
    const [vaultId, content] = loaded.save.mock.calls[0] as unknown as [
      string,
      StoredEntry["content"],
    ];
    expect(vaultId).toBe("bau");
    const passkey = passkeyOf(content);
    expect(passkey).toMatchObject({
      rpId: RP,
      username: "jonas.weber",
      displayName: "Jonas Weber",
    });
    expect(passkey?.credentialId.length).toBe(16);
    expect(content.fields.find((f) => f.id === "private-key")?.kind).toBe("secret");
    expect(answers).toHaveLength(1);
    const answer = answers[0] as Extract<PasskeyAnswer, { outcome: "credential" }>;
    expect(answer.outcome).toBe("credential");
    const verified = await verifyRegistrationResponse({
      response: answer.credential as RegistrationJSON,
      expectedChallenge: CHALLENGE,
      expectedOrigin: ORIGIN,
      expectedRPID: RP,
    });
    expect(verified.verified).toBe(true);
    expect(verified.registrationInfo?.credential.id).toBe(
      encodeBytes(passkey?.credentialId ?? new Uint8Array()),
    );
  });

  it("not on a click the browser did not deliver, nor while covered or not clear", async () => {
    for (const options of [{ trusted: false }, { visible: false }, { clear: false }]) {
      const { answers } = await show(createCeremony, options);
      await click("Passkey speichern");
      expect(loaded.save, JSON.stringify(options)).not.toHaveBeenCalled();
      expect(answers).toEqual([]);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts signiert.",
      );
      dispose();
      document.body.innerHTML = "";
    }
  });

  it("not when the store refuses: it says so and answers nothing yet", async () => {
    loaded.save = vi.fn(async () => ({ ok: false, error: "unreachable" }));
    const { answers } = await show(createCeremony);
    await click("Passkey speichern");
    expect(answers).toEqual([]);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Das hat nicht geklappt",
    );
  });

  it("not for an account it already holds, nor without a vault it may write", async () => {
    const known = storedPasskey("p1", "jonas.weber");
    loaded.entries = [known.entry];
    await show({ ...createCeremony, exclude: [known.credentialId] });
    expect(document.body.textContent).toContain(
      "Für dieses Konto liegt schon ein Passkey in Kennwort.",
    );
    expect(button("Passkey speichern")).toBeUndefined();
    dispose();
    loaded.entries = [];
    loaded.vaults = [vault("kunden", "Kunden", "read")];
    const { answers } = await show(createCeremony);
    expect(document.body.textContent).toContain("keinen Tresor");
    await click("Anderes Gerät verwenden");
    expect(answers).toEqual([{ outcome: "fallback" }]);
  });
});

describe("the passkey prompt signs in", () => {
  it("with the chosen passkey for exactly the rpId, and SimpleWebAuthn accepts the assertion", async () => {
    const jonas = storedPasskey("p1", "jonas.weber");
    const anna = storedPasskey("p22", "anna.weber");
    const other = storedPasskey("p333", "max.weber", "portal.weber-haustechnik.test");
    loaded.entries = [jonas.entry, anna.entry, other.entry];
    const { answers, types } = await show(getCeremony());
    expect(types()).toContain("prompt-show");
    expect(document.body.textContent).toContain("Mit Passkey anmelden?");
    expect(button("Anmelden als max.weber")).toBeUndefined();
    await click("Anmelden als anna.weber");
    const answer = answers[0] as Extract<PasskeyAnswer, { outcome: "credential" }>;
    expect(answer.credential.id).toBe(anna.credentialId);
    const verified = await verifyAuthenticationResponse({
      response: answer.credential as AssertionJSON,
      expectedChallenge: CHALLENGE,
      expectedOrigin: ORIGIN,
      expectedRPID: RP,
      credential: { id: anna.credentialId, publicKey: anna.cose, counter: 0 },
      requireUserVerification: true,
    });
    expect(verified.verified).toBe(true);
    expect((answer.credential as AssertionJSON).response.userHandle).toBe("Bwc");
  });

  it("offers only the passkeys the page allows", async () => {
    const jonas = storedPasskey("p1", "jonas.weber");
    const anna = storedPasskey("p22", "anna.weber");
    loaded.entries = [jonas.entry, anna.entry];
    await show(getCeremony([jonas.credentialId]));
    expect(button("Anmelden als jonas.weber")).toBeDefined();
    expect(button("Anmelden als anna.weber")).toBeUndefined();
  });

  it("signs nothing under a cover", async () => {
    loaded.entries = [storedPasskey("p1", "jonas.weber").entry];
    const { answers } = await show(getCeremony(), { visible: false });
    await click("Anmelden als jonas.weber");
    expect(answers).toEqual([]);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("nichts signiert");
  });
});

describe("the passkey prompt hands the ceremony to the browser", () => {
  it("unseen while locked", async () => {
    const locked = await show(getCeremony(), { phase: "locked" });
    expect(locked.answers).toEqual([{ outcome: "fallback" }]);
    expect(locked.types()).not.toContain("prompt-show");
  });

  // The page sees whether the prompt shows: shown only for a match, it would learn which passkeys
  // Kennwort holds before the user agreed to anything (WebAuthn §14.5.2)
  it("without a matching passkey only after a click, the prompt shown as for a match", async () => {
    loaded.entries = [storedPasskey("p1", "jonas.weber").entry];
    const none = await show(getCeremony(["AAAA"]));
    expect(none.answers).toEqual([]);
    expect(none.types()).toContain("prompt-show");
    expect(document.body.textContent).toContain("Kennwort hat keinen passenden Passkey");
    expect(button("Anmelden als jonas.weber")).toBeUndefined();
    await click("Anderes Gerät verwenden");
    expect(none.answers).toEqual([{ outcome: "fallback" }]);
  });

  it("on Anderes Gerät verwenden, and ends it with ×, in English too", async () => {
    setLocale("en", { reload: false });
    loaded.entries = [storedPasskey("p1", "jonas.weber").entry];
    const { answers } = await show(getCeremony());
    expect(document.body.textContent).toContain("Sign in with a passkey?");
    await click("Use another device");
    (document.querySelector("header button") as HTMLButtonElement).click();
    expect(answers).toEqual([
      { outcome: "fallback" },
      { outcome: "error", name: "NotAllowedError" },
    ]);
  });
});

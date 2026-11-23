import type { PasskeyError } from "@kennwort/client/session/passkey-unlock.ts";
import { addPasskey, removePasskey, type UnlockPasskeys } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation } from "../navigation.ts";
import type { PasskeyUnlock } from "../session/passkey.ts";
import type { Session } from "../session/session.ts";
import { activePasskeys, PasskeySection } from "./passkey-section.tsx";
import { UnlockPage } from "./unlock-page.tsx";

// K-707: Einstellungen → Entsperren mit Passkey, and the lock screen's passkey button
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
  flush();
};

const id = (fill: number) => new Uint8Array(20).fill(fill);
const salt = new Uint8Array(32).fill(5);
type Answer = { ok: true; value: unknown } | { ok: false; error: PasskeyError };

const fakeUnlock = (answer: Answer, offered = true) => {
  const calls: string[] = [];
  const unlock = {
    offered: () => (offered ? { accountId: "a", credentialId: "Aw", salt: "s" } : undefined),
    thisDevice: () => "AwMDAwMDAwMDAwMDAwMDAwMDAwM",
    forget: () => {},
    setUp: async () => {
      calls.push("setUp");
      return answer;
    },
    remove: async (credentialId: string) => {
      calls.push(`remove ${credentialId}`);
      return answer;
    },
    unlock: async () => {
      calls.push("unlock");
      return answer;
    },
  } as unknown as PasskeyUnlock;
  return { unlock, calls };
};

const mount = (view: () => ReturnType<typeof PasskeySection>) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(view, root);
  flush();
  return root;
};

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

const twoPasskeys = (): UnlockPasskeys => {
  const first = addPasskey({}, id(3), salt, 1000) ?? {};
  const second = addPasskey(first, id(4), salt, 2000) ?? {};
  return removePasskey(addPasskey(second, id(6), salt, 3000) ?? {}, id(6)) ?? {};
};

describe("PasskeySection", () => {
  it("lists the passkeys that unlock, newest first, never a removed one", () => {
    expect(activePasskeys(twoPasskeys()).map((p) => p.at)).toEqual([2000, 1000]);
    const { unlock } = fakeUnlock({ ok: true, value: true });
    const root = mount(() => <PasskeySection passkeys={twoPasskeys()} unlock={unlock} />);
    const rows = root.querySelectorAll('[data-testid="passkeys"] li');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain("Dieses Gerät");
    expect(rows[0]?.textContent).not.toContain("Dieses Gerät");
  });

  it("sets up a passkey and says so", async () => {
    const { unlock, calls } = fakeUnlock({ ok: true, value: true });
    const root = mount(() => <PasskeySection passkeys={{}} unlock={unlock} />);
    expect(root.querySelector('[data-testid="passkeys"]')).toBeNull();
    button(root, "Passkey zum Entsperren einrichten")?.click();
    await settle();
    expect(calls).toEqual(["setUp"]);
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "entsperrt Kennwort jetzt",
    );
  });

  it("says plainly when the browser or passkey has no PRF", async () => {
    const { unlock } = fakeUnlock({ ok: false, error: "no-prf" });
    const root = mount(() => <PasskeySection passkeys={{}} unlock={unlock} />);
    button(root, "einrichten")?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("PRF-Erweiterung");
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it("removes a passkey", async () => {
    const { unlock, calls } = fakeUnlock({ ok: true, value: true });
    const root = mount(() => <PasskeySection passkeys={twoPasskeys()} unlock={unlock} />);
    button(root, "Entfernen")?.click();
    await settle();
    expect(calls).toEqual(["remove BAQEBAQEBAQEBAQEBAQEBAQEBAQ"]);
  });
});

describe("the lock screen with a passkey (K-707)", () => {
  const lockScreen = (answer: Answer, offered = true) => {
    const { unlock, calls } = fakeUnlock(answer, offered);
    let unlocked = 0;
    const session = {
      device: () => ({ accountId: "a", secretKey: new Uint8Array(16) }),
      passkey: unlock,
    } as unknown as Session;
    const root = mount(() => (
      <UnlockPage
        nav={createNavigation(window)}
        session={session}
        onUnlocked={() => {
          unlocked += 1;
        }}
      />
    ));
    return { root, calls, unlocked: () => unlocked };
  };

  it("offers the passkey above the passphrase, which stays", async () => {
    const { root, calls, unlocked } = lockScreen({ ok: true, value: true });
    expect(root.querySelector("input[type=password]")).not.toBeNull();
    button(root, "Mit Passkey entsperren")?.click();
    await settle();
    expect(calls).toEqual(["unlock"]);
    expect(unlocked()).toBe(1);
  });

  it("offers no passkey on a device without one", () => {
    const { root } = lockScreen({ ok: true, value: true }, false);
    expect(button(root, "Mit Passkey entsperren")).toBeUndefined();
    expect(root.querySelector("input[type=password]")).not.toBeNull();
  });

  it("shows why the passkey did not unlock", async () => {
    const { root, unlocked } = lockScreen({ ok: false, error: "wrong-passkey" });
    button(root, "Mit Passkey entsperren")?.click();
    await settle();
    expect(root.textContent).toContain("Der Passkey konnte Kennwort nicht entsperren");
    expect(unlocked()).toBe(0);
  });
});

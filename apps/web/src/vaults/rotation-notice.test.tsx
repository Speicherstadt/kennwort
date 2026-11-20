import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { RotationNotice } from "./rotation-notice.tsx";

// K-307 part b (P-11): while someone left and the key is not rotated yet, every client warns
let dispose = () => {};
afterEach(() => dispose());

const vault = (name: string | undefined, rotationDue: boolean) => ({
  name,
  log: { rotationDue },
});

describe("RotationNotice", () => {
  it("names each vault whose rotation is due, and goes once it is done", () => {
    setLocale("de", { reload: false });
    const root = document.createElement("div");
    const [vaults, setVaults] = createSignal([vault("Büro", true), vault("Persönlich", false)]);
    dispose = render(() => <RotationNotice vaults={vaults()} />, root);
    flush();
    const notes = [...root.querySelectorAll('[role="status"] p')].map((p) => p.textContent);
    expect(notes).toEqual([
      "Im Tresor Büro steht ein Schlüsselwechsel aus: Jemand wurde entfernt, und ein Verwalter muss den Tresor noch neu verschlüsseln. Bis dahin kann dort niemand etwas ändern.",
    ]);
    setVaults([vault("Büro", false)]);
    flush();
    expect(root.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("says nothing before the vaults are loaded, and names an unnamed vault in English", () => {
    setLocale("en", { reload: false });
    const root = document.createElement("div");
    const [vaults, setVaults] = createSignal<ReturnType<typeof vault>[] | undefined>(undefined);
    dispose = render(() => <RotationNotice vaults={vaults()} />, root);
    flush();
    expect(root.querySelector('[role="status"]')?.textContent).toBe("");
    setVaults([vault(undefined, true)]);
    flush();
    expect(root.textContent).toContain("The vault Unnamed vault is waiting for a key change");
    setLocale("de", { reload: false });
  });
});

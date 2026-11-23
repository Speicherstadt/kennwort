import { type AccountState, emptyState, mergeStates } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation } from "../navigation.ts";
import type { Session } from "../session/session.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { createSecurity, type SecurityWiring } from "./security-wiring.tsx";

// Review of K-603: the choice of the leak check as the security page writes it
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const NOW = Date.UTC(2026, 10, 23, 9);
const HOUR = 60 * 60 * 1000;

const switchedOffOver = async (state: AccountState) => {
  setLocale("de");
  const changes: ((state: AccountState) => AccountState)[] = [];
  const session = {
    opened: () => ({ token: "t", state }),
    updateState: async (_api: unknown, change: (state: AccountState) => AccountState) => {
      changes.push(change);
      return { ok: true };
    },
  } as unknown as Session;
  const wiring: SecurityWiring = {
    api: {
      pwnedRange: async () => ({ ok: false, error: "unavailable" }),
    } as unknown as SecurityWiring["api"],
    session,
    nav: createNavigation(window),
    store: { shown: () => ({ state: "loading" }) } as unknown as VaultStore,
    entries: () => [],
    vaultName: () => "Büro",
    now: () => NOW,
  };
  const container = document.createElement("div");
  document.body.append(container);
  dispose = render(createSecurity(wiring).page, container);
  flush();
  const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error("no switch");
  expect(box.checked).toBe(true);
  box.checked = false;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  await Promise.resolve();
  const change = changes[0];
  if (!change) throw new Error("nothing saved");
  return change(state);
};

describe("createSecurity, switching the leak check", () => {
  it("switches off for every device though the choice it replaces is dated ahead of this clock", async () => {
    // Switched on by a device whose clock runs an hour ahead
    const before: AccountState = {
      ...emptyState(new Uint8Array(32)),
      leakCheck: { on: true, at: NOW + HOUR },
    };
    const after = await switchedOffOver(before);
    expect(after.leakCheck?.on).toBe(false);
    // That device still holds the earlier state and merges the new one into it: off must win
    const onThatDevice = mergeStates(before, after);
    const onThisDevice = mergeStates(after, before);
    expect(onThatDevice.ok && onThatDevice.value.leakCheck?.on).toBe(false);
    expect(onThisDevice.ok && onThisDevice.value.leakCheck?.on).toBe(false);
  });
});

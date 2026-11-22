import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { createRoot, createSignal, flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { PopupAccount } from "./popup-account.ts";

// K-405: every page that loads the entries reports them, so the alert list follows them
const [entries, setEntries] = createSignal<StoredEntry[]>([]);
vi.mock("@kennwort/client/entries/entry-store.ts", () => ({
  httpServerFor: () => ({}),
  createEntryStore: () => ({ entries, load: async () => {} }),
}));
vi.mock("@kennwort/client/vaults/vaults.ts", () => ({
  loadVaults: async () => ({ ok: true, value: { vaults: [], trust: {} } }),
}));
const { createEntryLoad } = await import("./load-entries.ts");

const entry = (idText: string, version: number) => ({ idText, version }) as StoredEntry;

describe("createEntryLoad", () => {
  it("reports the loaded entries, and again whenever they change", async () => {
    const account = { api: () => ({ syncFetch: fetch }) } as unknown as PopupAccount;
    const onEntries = vi.fn();
    setEntries([entry("portal", 1)]);
    const load = createRoot(() => createEntryLoad(account, { policy: false, onEntries }));
    flush();
    expect(onEntries).not.toHaveBeenCalled();
    await load.start();
    flush();
    expect(onEntries).toHaveBeenLastCalledWith([entry("portal", 1)]);
    setEntries([entry("portal", 2)]);
    flush();
    expect(onEntries).toHaveBeenLastCalledWith([entry("portal", 2)]);
  });
});

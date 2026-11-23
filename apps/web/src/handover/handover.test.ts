import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, EntryContent, MemberView } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { customers, type HandoverDeps, handoverWrites, runHandover } from "./handover.ts";

// K-605: Jonas (Weber Haustechnik) hands the vault „Heizung Müller“ over to Max of Müller Elektro
const content = (title: string, marked = false): EntryContent => ({
  type: "login",
  title,
  fields: [{ id: "password", name: "Passwort", value: "Kessel-2026", kind: "secret" }],
  tags: [],
  favorite: false,
  history: [],
  ...(marked ? { toChange: [{ account: "anna", at: 1, fields: ["password"] }] } : {}),
});
const stored = (idText: string, vaultIdText: string, title: string, marked = false) =>
  ({
    idText,
    vaultIdText,
    role: "manage",
    version: 1,
    content: content(title, marked),
  }) as StoredEntry;

const jonas = new Uint8Array(16).fill(1);
const max = new Uint8Array(16).fill(2);
const anna = new Uint8Array(16).fill(3);
const certificate = { accountId: max } as unknown as Certificate;
const person = (accountId: Uint8Array, extra: Partial<MemberView> = {}): MemberView => ({
  accountId,
  name: null,
  role: "member",
  status: "certified",
  certificate: { accountId } as unknown as Certificate,
  ...extra,
});

describe("handing a vault over", () => {
  it("takes the vault's entries as new ones, without the marks of the own company", () => {
    const writes = handoverWrites(
      [stored("e1", "heizung", "Router", true), stored("e2", "buero", "Bank")],
      "heizung",
    );
    expect(writes).toEqual([{ kind: "new", content: content("Router") }]);
    expect(writes[0]?.kind === "new" && "toChange" in writes[0].content).toBe(false);
  });

  it("offers certified people of the customer's company, never the installer or who left", () => {
    const people = [
      person(jonas),
      person(max),
      person(anna, { status: "pending" }),
      person(new Uint8Array(16).fill(4), { leftAt: 5 }),
      {
        accountId: new Uint8Array(16).fill(5),
        name: null,
        role: "member",
        status: "certified",
      } as MemberView,
      person(new Uint8Array(16).fill(6), { leftAt: null }),
    ];
    expect(customers(people, jonas).map((p) => p.accountId[0])).toEqual([2, 6]);
  });

  const vault = (idText: string, step: number) => ({ idText, step }) as unknown as Vault;
  const loaded = (vaults: Vault[]) => ({ vaults }) as unknown as Loaded;
  const deps = (overrides: Partial<HandoverDeps> = {}) => {
    const calls: string[] = [];
    let reloads = 0;
    const base: HandoverDeps = {
      create: async (name) => {
        calls.push(`create ${name}`);
        return { ok: true, value: "neu" };
      },
      reload: async () => {
        reloads += 1;
        calls.push("reload");
        return loaded([vault("neu", reloads)]);
      },
      save: (vaultIdText) => async (batch) => {
        calls.push(`save ${vaultIdText} ${batch.length}`);
        return { ok: true, value: { saved: batch.map((_, i) => String(i)), unsaved: 0 } };
      },
      add: async (v, customer) => {
        calls.push(`add ${(v as unknown as { step: number }).step} ${customer.accountId[0]}`);
        return { ok: true };
      },
      reduce: async (v, accountId) => {
        calls.push(`reduce ${(v as unknown as { step: number }).step} ${accountId[0]}`);
        return { ok: true };
      },
      ...overrides,
    };
    return { calls, deps: base };
  };
  const handover = {
    vaultName: "Heizung Müller",
    writes: handoverWrites([stored("e1", "h", "Router")], "h"),
  };

  it("makes the vault, writes the entries, adds the customer, then reduces the installer", async () => {
    const { calls, deps: d } = deps();
    expect(await runHandover(d, handover, certificate, jonas)).toEqual({
      ok: true,
      value: { vaultIdText: "neu", written: 1 },
    });
    // The role is reduced on the log as it stands after the customer was added
    expect(calls).toEqual([
      "create Heizung Müller",
      "reload",
      "save neu 1",
      "add 1 2",
      "reload",
      "reduce 2 1",
      "reload",
    ]);
  });

  it("stops at the first step that fails and says which", async () => {
    const fail = { ok: false as const, error: "unreachable" as const };
    const at = async (overrides: Partial<HandoverDeps>) =>
      runHandover(deps(overrides).deps, handover, certificate, jonas);
    expect(await at({ create: async () => ({ ok: false, error: "uncertified" }) })).toEqual({
      ok: false,
      step: "create",
    });
    expect(await at({ reload: async () => undefined })).toEqual({
      ok: false,
      step: "create",
      vaultIdText: "neu",
    });
    expect(await at({ save: () => async () => ({ ok: false, error: "unreachable" }) })).toEqual({
      ok: false,
      step: "entries",
      vaultIdText: "neu",
    });
    expect(await at({ add: async () => fail })).toEqual({
      ok: false,
      step: "customer",
      vaultIdText: "neu",
    });
    expect(await at({ reduce: async () => fail })).toEqual({
      ok: false,
      step: "role",
      vaultIdText: "neu",
    });
    let reloads = 0;
    const gone = async () => (++reloads === 1 ? loaded([vault("neu", 1)]) : loaded([]));
    expect(await at({ reload: gone })).toEqual({ ok: false, step: "role", vaultIdText: "neu" });
  });
});

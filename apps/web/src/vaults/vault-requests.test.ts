import { encodeBytes, idKey } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import { endOfDay } from "./day.ts";
import {
  addToVault,
  declineRequest,
  hasExpired,
  loadRequests,
  requestAccess,
  vaultIdOf,
} from "./vault-members.ts";
import { certifiedAnna, jonasWithVaults, vaultServer } from "./vaults.test-kit.ts";
import { loadVaults, newVault, type Vault } from "./vaults.ts";

// K-305 part 4: Anna asks for access to Büro; Jonas grants it for a while, or declines
const bueroAsked = async () => {
  const w = await jonasWithVaults((c) => [ownerRow(c), certifiedAnna(c)]);
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const current = async () => {
    const loaded = await loadVaults(w.api, w.c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    return { vault: loaded.value.vaults[0] as Vault, people: loaded.value.people };
  };
  const { people } = await current();
  const anna = people.find((p) => p.name === "Anna");
  if (!anna) throw new Error("no Anna");
  // Anna's device asked (the fake server knows no sessions)
  w.store.vaults.get(made.value)?.requests.set(encodeBytes(anna.accountId), 1);
  return { ...w, current, anna, made };
};

describe("access requests", () => {
  it("shows Anna's request to Jonas with her confirmed certificate", async () => {
    const w = await bueroAsked();
    const { vault, people } = await w.current();
    const requests = await loadRequests(w.api, w.c.session, vault, people);
    expect(requests?.map((r) => [r.name, r.certificate !== undefined])).toEqual([["Anna", true]]);
  });

  it("grants it by adding Anna, which ends the request", async () => {
    const w = await bueroAsked();
    let { vault, people } = await w.current();
    const [request] = (await loadRequests(w.api, w.c.session, vault, people)) ?? [];
    if (!request?.certificate) throw new Error("no request");
    expect(await addToVault(w.api, w.c.session, vault, request.certificate, "read")).toEqual({
      ok: true,
    });
    ({ vault, people } = await w.current());
    expect(await loadRequests(w.api, w.c.session, vault, people)).toEqual([]);
  });

  it("declines it", async () => {
    const w = await bueroAsked();
    const { vault, people } = await w.current();
    expect(await declineRequest(w.api, w.c.session, vault, w.anna.accountId)).toEqual({ ok: true });
    expect(await loadRequests(w.api, w.c.session, vault, people)).toEqual([]);
    const offline = { ...w.api, dropRequest: async () => false };
    expect(await declineRequest(offline, w.c.session, vault, w.anna.accountId)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("offers no grant for keys the root key did not confirm, and none to a non-manager", async () => {
    const w = await bueroAsked();
    const { vault, people } = await w.current();
    const unconfirmed = people.map((p) =>
      p.name === "Anna" ? { ...p, status: "pending" as const } : p,
    );
    const [request] = (await loadRequests(w.api, w.c.session, vault, unconfirmed)) ?? [];
    expect(request?.certificate).toBeUndefined();
    const reader = { ...vault, role: "read" as const };
    expect(await loadRequests(w.api, w.c.session, reader, people)).toBeUndefined();
  });

  it("sends Anna's request for a vault she found by link", async () => {
    const w = await bueroAsked();
    const id = vaultIdOf(w.made.value);
    if (!id) throw new Error("no ID");
    const asking = vaultServer(w.anna.accountId);
    await asking.api.newVault("t", id);
    expect(await requestAccess({ ...w.api, ...asking.api }, w.c.session, id)).toBe(true);
    expect([...(asking.vaults.get(w.made.value)?.requests.keys() ?? [])]).toEqual([
      encodeBytes(w.anna.accountId),
    ]);
    w.c.session.lock();
    flush();
    expect(await requestAccess(w.api, w.c.session, id)).toBe(false);
  });
});

describe("time limits", () => {
  it("adds Anna until a day; the log keeps the limit and it runs out by the clock", async () => {
    const w = await bueroAsked();
    let { vault, people } = await w.current();
    const anna = people.find((p) => p.name === "Anna");
    if (!anna?.certificate) throw new Error("no Anna");
    const until = Math.floor(Date.now() / 1000) + 3600;
    expect(await addToVault(w.api, w.c.session, vault, anna.certificate, "read", until)).toEqual({
      ok: true,
    });
    ({ vault } = await w.current());
    const member = vault.log.members.get(idKey(anna.accountId));
    expect(member?.validUntil).toBe(until);
    expect(hasExpired({ validUntil: until }, until - 1)).toBe(false);
    expect(hasExpired({ validUntil: until }, until)).toBe(true);
    expect(hasExpired({ validUntil: 0 }, until)).toBe(false);
  });

  it("reads the chosen day as its end on this device, and no day as no end", () => {
    expect(endOfDay("")).toBe(0);
    expect(endOfDay("kein Tag")).toBe(0);
    expect(endOfDay("2027-03-01")).toBe(
      Math.floor(new Date("2027-03-01T23:59:59").getTime() / 1000),
    );
  });
});

describe("vault IDs from links", () => {
  it("takes 16 bytes in base64url, nothing else", () => {
    expect(vaultIdOf("AQEBAQEBAQEBAQEBAQEBAQ")).toEqual(new Uint8Array(16).fill(1));
    expect(vaultIdOf("office")).toBeUndefined();
    expect(vaultIdOf("AQEBAQEBAQEBAQEBAQEB")).toBeUndefined();
  });
});

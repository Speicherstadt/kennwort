// Review of K-305 part 4: requests of members whose time ran out, limits in the past

import { loadVaults, newVault, type Vault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, idKey } from "@kennwort/core";
import { describe, expect, it, vi } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import { addToVault, grantRequest, loadRequests } from "./vault-members.ts";
import { certifiedAnna, jonasWithVaults } from "./vaults.test-kit.ts";

const buero = async () => {
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
  if (!anna?.certificate) throw new Error("no Anna");
  return { ...w, current, anna, certificate: anna.certificate, made };
};

describe("requests and time limits against what the review found (K-305 part 4)", () => {
  it("shows the manager the request of a member whose time ran out, and granting renews it", async () => {
    const w = await buero();
    let { vault } = await w.current();
    const soon = Math.floor(Date.now() / 1000) + 60;
    expect(await addToVault(w.api, w.c.session, vault, w.certificate, "read", soon)).toEqual({
      ok: true,
    });
    // an hour later Anna's access has run out; the server takes her request (she is no current member)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3600_000);
    try {
      w.store.vaults.get(w.made.value)?.requests.set(encodeBytes(w.anna.accountId), 1);
      let { vault: now, people } = await w.current();
      vault = now;
      const requests = await loadRequests(w.api, w.c.session, vault, people);
      expect(requests?.map((r) => [r.name, r.expired])).toEqual([["Anna", true]]);
      const [request] = requests ?? [];
      if (!request?.certificate) throw new Error("no certificate");
      const granted = await grantRequest(
        w.api,
        w.c.session,
        vault,
        { ...request, certificate: request.certificate },
        "edit",
      );
      expect(granted).toEqual({ ok: true });
      ({ vault: now, people } = await w.current());
      vault = now;
      expect(vault.log.members.get(idKey(w.anna.accountId))).toMatchObject({
        role: "edit",
        validUntil: 0,
      });
      expect(await loadRequests(w.api, w.c.session, vault, people)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not add a member whose time already ran out", async () => {
    const w = await buero();
    const { vault } = await w.current();
    const past = Math.floor(Date.now() / 1000) - 86400;
    const added = await addToVault(w.api, w.c.session, vault, w.certificate, "read", past);
    expect(added).toEqual({ ok: false, error: "past" });
  });
});

import { bytes, type Policy, signPolicy } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { jonasCompany, server } from "../members/members.test-kit.ts";
import { withQueries } from "../queries.test-kit.tsx";
import { PolicySection } from "./policy-section.tsx";

// K-304 part 4: the company policy on the members page, in German
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  flush();
};
const COMPANY = "wMDAwMDAwMDAwMDAwMDAwA";

const show = async (canEdit: boolean, policy: (root: Uint8Array) => Policy | null = () => null) => {
  setLocale("de", { reload: false });
  const c = await jonasCompany();
  const s = server(c, []);
  const saved: Policy[] = [];
  let served = policy(c.opened.state.rootSecretKey ?? new Uint8Array());
  const api = {
    ...s.api,
    company: async () => ({
      id: COMPANY,
      rootPublicKey: c.rootPublicKey,
      policy: served,
      recoveryPublicKey: null,
    }),
    savePolicy: async (_t: string, next: Policy) => {
      saved.push(next);
      served = next;
      return true;
    },
  };
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => withQueries(() => <PolicySection session={c.session} api={api} canEdit={canEdit} />),
    root,
  );
  flush();
  await settle();
  return { root, saved };
};

describe("PolicySection", () => {
  it("tells everyone the lock time the company set", async () => {
    const signed = (root: Uint8Array) =>
      signPolicy(root, {
        companyId: bytes(16).parse(COMPANY),
        version: 1,
        lockAfterMinutes: 4,
        companyRecovery: { enabled: false },
      });
    const { root } = await show(false, signed);
    expect(root.querySelector("h2")?.textContent).toBe("Firmen-Richtlinien");
    expect(root.textContent).toContain("Kennwort sperrt sich nach 4 Minuten ohne Nutzung.");
    expect(root.querySelector("form")).toBeNull();
  });

  it("lets an owner save a new lock time as the next signed version", async () => {
    const { root, saved } = await show(true);
    const field = root.querySelector<HTMLInputElement>("input[type=number]");
    if (!field) throw new Error("no field");
    expect(field.value).toBe("10");
    field.value = "3";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect(saved.map((p) => [p.version, p.lockAfterMinutes])).toEqual([[1, 3]]);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Gespeichert. Die neue Zeit gilt auf allen Geräten.",
    );
  });

  it("saves nothing outside one to sixty minutes", async () => {
    const { root, saved } = await show(true);
    const field = root.querySelector<HTMLInputElement>("input[type=number]");
    if (!field) throw new Error("no field");
    for (const value of ["0", "61", "2.5", ""]) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      flush();
      root
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();
    }
    expect(saved).toEqual([]);
  });

  it("warns about a policy that is not signed by the company's root", async () => {
    const forged = () =>
      signPolicy(ed25519KeyPair().secretKey, {
        companyId: bytes(16).parse(COMPANY),
        version: 1,
        lockAfterMinutes: 60,
        companyRecovery: { enabled: false },
      });
    const { root } = await show(true, forged);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "nicht gültig unterschrieben",
    );
    expect(root.querySelector("form")).toBeNull();
  });
});

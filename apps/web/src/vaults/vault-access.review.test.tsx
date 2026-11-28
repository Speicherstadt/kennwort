import type { Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type MemberView } from "@kennwort/core";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { managerNameOf } from "./vault-access.ts";
import { createVaultActions, type VaultActionsDeps } from "./vault-actions.ts";
import { VaultAddBar } from "./vault-add-bar.tsx";
import type { VaultMember } from "./vault-members.ts";

const id = (n: number) => new Uint8Array(16).fill(n);
const dummyCert = (n: number): Certificate => ({
  accountId: id(n),
  xwingPublicKey: new Uint8Array(1216),
  edPublicKey: new Uint8Array(32),
  companyId: id(99),
  role: "member",
  issuedAt: 1,
  signature: new Uint8Array(65),
});

const person = (n: number, name: string): MemberView => ({
  accountId: id(n),
  name,
  role: n === 1 ? "owner" : "member",
  status: "certified",
  certificate: dummyCert(n),
  leftAt: null,
  previous: [],
});

const makeVault = (members: [number, "read" | "edit" | "manage", number?][]): Vault =>
  ({
    idText: "buero",
    name: "Büro",
    role: "manage",
    entries: [],
    log: {
      members: new Map(
        members.map(([n, role, validUntil = 0]) => [
          idKey(id(n)),
          { role, validUntil, fingerprint: new Uint8Array(32) },
        ]),
      ),
      epoch: 0,
      lastHash: new Uint8Array(32),
      nextSeq: 1,
      rotationDue: false,
      keys: new Map(),
      removedSinceRotate: [],
    },
  }) as unknown as Vault;

const memberOf = (n: number, name: string): VaultMember => ({
  accountId: id(n),
  name,
  role: "read",
  validUntil: 0,
  me: false,
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  document.body.innerHTML = "";
});

const mount = (view: () => unknown) => {
  const root = document.createElement("div");
  document.body.append(root);
  cleanups.push(render(view as () => never, root));
  flush();
  return root;
};

const fakeDeps = (over: Partial<VaultActionsDeps> = {}): VaultActionsDeps => ({
  api: {} as VaultActionsDeps["api"],
  session: {} as VaultActionsDeps["session"],
  exits: {
    remove: vi.fn(async () => ({ ok: true as const })),
    changeRole: vi.fn(async () => ({ ok: true as const })),
  },
  ready: () =>
    ({
      vaults: [makeVault([[1, "manage"]])],
      trust: {},
      left: new Set(),
    }) as unknown as Loaded,
  run: vi.fn(async () => undefined),
  flashKeys: vi.fn(),
  showToast: vi.fn(),
  closeDialogs: vi.fn(),
  ...over,
});

const comboInput = (root: HTMLElement) => {
  const el = root.querySelector<HTMLInputElement>("input[role='combobox']");
  if (!el) throw new Error("combobox not found");
  return el;
};

describe("K-608 tdd-review findings: actions and helpers", () => {
  it("1: closes RemoveMemberDialog and UntilMemberDialog even when the action fails so the error alert is visible", async () => {
    const closeDialogs = vi.fn();
    const deps = fakeDeps({
      run: vi.fn(async () => "stale" as const),
      closeDialogs,
    });
    const actions = createVaultActions(deps);
    const vault = makeVault([
      [1, "manage"],
      [2, "read"],
    ]);
    await actions.remove(vault, memberOf(2, "Anna"));
    expect(closeDialogs).toHaveBeenCalledTimes(1);
    await actions.until(vault, memberOf(2, "Anna"), 1_900_000_000);
    expect(closeDialogs).toHaveBeenCalledTimes(2);
  });

  it("3a: multi-add flashes succeeded people on partial failure and returns added keys", async () => {
    const flashKeys = vi.fn();
    let calls = 0;
    const deps = fakeDeps({
      run: vi.fn(async () => (++calls === 1 ? undefined : ("stale" as const))),
      flashKeys,
    });
    const actions = createVaultActions(deps);
    const vault = makeVault([[1, "manage"]]);
    const anna = {
      key: idKey(id(2)),
      accountId: id(2),
      name: "Anna",
      certificate: dummyCert(2),
      unconfirmed: false,
    };
    const tim = {
      key: idKey(id(3)),
      accountId: id(3),
      name: "Tim",
      certificate: dummyCert(3),
      unconfirmed: false,
    };
    const added = await actions.add(vault, [anna, tim], "read", 0);
    expect(flashKeys).toHaveBeenCalledWith([anna.key], true);
    expect(added).toEqual([anna.key]);
  });

  it("4: managerNameOf skips expired managers and returns an active one", () => {
    const people = [person(1, "Anna"), person(2, "Jonas")];
    const vault = makeVault([
      [1, "manage", 1], // expired
      [2, "manage", 0], // active
    ]);
    expect(managerNameOf(vault, people)).toBe("Jonas");
  });
});

describe("K-608 tdd-review findings: VaultAddBar", () => {
  it("2: keeps picked chips and search text when the same vault reloads with a new object reference", () => {
    const people = [person(1, "Jonas"), person(2, "Anna"), person(3, "Tim")];
    const [vault, setVault] = createSignal(makeVault([[1, "manage"]]));
    const root = mount(() => (
      <VaultAddBar
        vault={vault()}
        people={people}
        entryCount={0}
        busy={false}
        onAdd={async () => []}
      />
    ));
    const input = comboInput(root);
    input.focus();
    input.value = "An";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flush();
    root.querySelector<HTMLButtonElement>("[role='option']")?.click();
    flush();
    input.value = "Ti";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flush();
    expect(root.textContent).toContain("Anna");
    expect(input.value).toBe("Ti");

    // Same vault idText, new object reference (e.g. SSE reload)
    setVault({ ...vault() });
    flush();
    expect(root.textContent).toContain("Anna");
    expect(input.value).toBe("Ti");
  });

  it("3b: keeps failed people picked when onAdd does not add them", async () => {
    const vault = makeVault([[1, "manage"]]);
    const people = [person(1, "Jonas"), person(2, "Anna")];
    const root = mount(() => (
      <VaultAddBar
        vault={vault}
        people={people}
        entryCount={0}
        busy={false}
        onAdd={async () => []}
      />
    ));
    const input = comboInput(root);
    input.focus();
    input.dispatchEvent(new Event("focus", { bubbles: true }));
    flush();
    root.querySelector<HTMLButtonElement>("[role='option']")?.click();
    flush();
    const submitBtn = [...root.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Hinzufügen",
    );
    submitBtn?.click();
    await Promise.resolve();
    flush();
    expect(root.textContent).toContain("Anna");
  });
});

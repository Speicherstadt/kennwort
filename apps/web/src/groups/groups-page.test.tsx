import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { createQueryClient, queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
import type { DialogApi } from "../vaults/dialog-state.ts";
import type { Exits } from "../vaults/exit.ts";
import type { VaultStore } from "../vaults/vault-store.ts";
import { GroupsPage } from "./groups-page.tsx";

// K-305 part 5: the groups page, its list loaded through the opened account's query cache
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  flush();
};

const jonas = new Uint8Array(16).fill(1);
const anna = new Uint8Array(16).fill(2);
const vaultId = new Uint8Array(16).fill(7);
const session = {
  opened: () => ({ accountId: jonas, token: "tok" }),
} as unknown as Session;
const owner = [{ accountId: jonas, name: "Jonas", role: "owner", status: "certified" }] as never;
const ownerAndAnna = [
  { accountId: jonas, name: "Jonas", role: "owner", status: "certified" },
  {
    accountId: anna,
    name: "Anna",
    role: "member",
    status: "certified",
    certificate: { accountId: anna },
  },
] as never;

const fakeApi = (groups: GroupApi["groups"], vaultGroups?: GroupApi["vaultGroups"]) =>
  ({
    groups,
    newGroup: vi.fn(async () => true),
    deleteGroup: async () => true,
    joinGroup: vi.fn(async () => true),
    leaveGroup: vi.fn(async () => true),
    vaultGroups: vaultGroups ?? (async () => []),
    linkGroup: vi.fn(async () => true),
    unlinkGroup: vi.fn(async () => true),
    appendLog: vi.fn(async () => "ok"),
  }) as unknown as DialogApi;

const fakeVault = (members: Map<string, { role: "read" | "edit" | "manage" }>): Vault =>
  ({
    idText: "v1",
    name: "Buchhaltung",
    role: "manage",
    ring: { vaultId },
    log: { members },
  }) as unknown as Vault;

const show = async (
  api: DialogApi,
  opts: {
    client?: ReturnType<typeof createQueryClient>;
    people?: never;
    store?: VaultStore;
    exits?: Exits;
  } = {},
) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () =>
      withQueries(
        () => (
          <GroupsPage
            api={api}
            session={session}
            people={() => opts.people ?? owner}
            store={opts.store}
            exits={opts.exits}
          />
        ),
        opts.client ?? createQueryClient(),
      ),
    root,
  );
  flush();
  await settle();
  return root;
};
const cards = (root: ParentNode) =>
  [...root.querySelectorAll("ul.grid > li")].map((li) => li.textContent ?? "");

describe("GroupsPage", () => {
  it("lists the company's groups", async () => {
    const root = await show(fakeApi(async () => [{ id: "g1", name: "Büro", members: [jonas] }]));
    expect(cards(root)).toHaveLength(1);
    expect(cards(root)[0]).toContain("Büro");
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it("says so when the groups cannot be loaded", async () => {
    const root = await show(fakeApi(async () => undefined));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Gruppen konnten nicht geladen oder geändert werden.",
    );
  });

  it("loads the groups anew after a change", async () => {
    let groups = [{ id: "g1", name: "Büro", members: [jonas] }];
    const listed = vi.fn(async () => groups);
    const api = fakeApi(listed);
    vi.mocked(api.newGroup).mockImplementation(async (_token, name) => {
      groups = [...groups, { id: "g2", name, members: [] }];
      return true;
    });
    const root = await show(api);
    const create = [...root.querySelectorAll("form")].at(-1);
    const field = create?.querySelector("input");
    if (!create || !field) throw new Error("no form");
    field.value = "Werkstatt";
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    flush();
    create.requestSubmit();
    await settle();
    expect(api.newGroup).toHaveBeenCalledWith("tok", "Werkstatt");
    expect(listed).toHaveBeenCalledTimes(2);
    expect(cards(root).map((c) => c.includes("Werkstatt"))).toEqual([false, true]);
  });

  it("shows linked vaults on the group card and previews direct access when choosing a person", async () => {
    const vault = fakeVault(new Map([["01".repeat(16), { role: "manage" }]]));
    const store = {
      shown: () => ({
        state: "ready",
        vaults: [vault],
        people: ownerAndAnna,
        left: new Set(),
        trust: {},
      }),
      reload: vi.fn(async () => undefined),
    } as unknown as VaultStore;
    const api = fakeApi(
      async () => [{ id: "g1", name: "Büro", members: [jonas] }],
      async () => [{ groupId: "g1", role: "read" }],
    );
    const root = await show(api, { people: ownerAndAnna, store });
    expect(cards(root)[0]).toContain("Buchhaltung");
    expect(cards(root)[0]).toContain("Lesen");

    const select = root.querySelector('select[aria-label="Person für Büro"]') as HTMLSelectElement;
    select.value = "02".repeat(16);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flush();
    expect(cards(root)[0]).toContain("Gibt direkt Zugriff auf: Buchhaltung (Lesen)");
  });

  it("keeps nothing secret in the query key", async () => {
    const client = createQueryClient();
    await show(
      fakeApi(async () => []),
      { client },
    );
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toEqual([queryKeys.groups]);
    expect(JSON.stringify(keys)).not.toContain("tok");
  });
});

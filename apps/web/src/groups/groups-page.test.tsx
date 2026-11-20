import type { GroupApi } from "@kennwort/client/session/groups-api.ts";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { createQueryClient, queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
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
const session = {
  opened: () => ({ accountId: jonas, token: "tok" }),
} as unknown as Session;
const owner = [{ accountId: jonas, name: "Jonas", role: "owner", status: "certified" }] as never;

const fakeApi = (groups: GroupApi["groups"]) =>
  ({
    groups,
    newGroup: vi.fn(async () => true),
    deleteGroup: async () => true,
    joinGroup: async () => true,
    leaveGroup: async () => true,
  }) as unknown as GroupApi;

const show = async (api: GroupApi, client = createQueryClient()) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () =>
      withQueries(() => <GroupsPage api={api} session={session} people={() => owner} />, client),
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

  it("keeps nothing secret in the query key", async () => {
    const client = createQueryClient();
    await show(
      fakeApi(async () => []),
      client,
    );
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toEqual([queryKeys.groups]);
    expect(JSON.stringify(keys)).not.toContain("tok");
  });
});

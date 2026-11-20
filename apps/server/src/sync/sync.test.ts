import { describe, expect, it } from "bun:test";
import { EntryRecord, encodeBytes, recordToWire, sealRecord } from "@kennwort/core";
import { anna, bank, contextFor, id, jonas, withField } from "@kennwort/core/testing";
import { ids, syncSetup, vaultId } from "../testing/sync-setup.ts";

const entryId = id(0xe1);
const recordBy = (person: typeof jonas, version: number, content = bank, entry = entryId) =>
  sealRecord(
    contextFor(person).author,
    contextFor(person).ring,
    entry,
    version,
    content,
    new Uint8Array(),
  );
const wire = (record: EntryRecord) => recordToWire(record);
const records = `/api/vaults/${vaultId}/records`;

const withVault = async () => {
  const setup = syncSetup();
  expect((await setup.request("/api/vaults", "t-jonas", { body: { id: vaultId } })).status).toBe(
    201,
  );
  return setup;
};
const put = (setup: ReturnType<typeof syncSetup>, token: string, body: unknown, path = records) =>
  setup.request(path, token, { method: "PUT", body });

describe("vaults", () => {
  it("creates a vault once; its ID is then taken, for every company", async () => {
    const setup = await withVault();
    expect((await setup.request("/api/vaults", "t-jonas", { body: { id: vaultId } })).status).toBe(
      409,
    );
    expect((await setup.request("/api/vaults", "t-petra", { body: { id: vaultId } })).status).toBe(
      409,
    );
    expect((await setup.request(records, "t-petra")).status).toBe(404);
  });

  it("refuses an ID that is not 16 bytes", async () => {
    const setup = syncSetup();
    for (const body of [{ id: "short" }, {}, "nope"])
      expect((await setup.request("/api/vaults", "t-jonas", { body })).status).toBe(400);
  });
});

describe("entry records", () => {
  it("stores each record as the next version and gives the newest of every entry", async () => {
    const setup = await withVault();
    expect(await (await setup.request(records, "t-anna")).json()).toEqual([]);
    expect((await put(setup, "t-jonas", wire(recordBy(jonas, 1)))).status).toBe(200);
    const second = recordBy(jonas, 1, bank, id(0xe2));
    expect((await put(setup, "t-jonas", wire(second))).status).toBe(200);
    const changed = recordBy(anna, 2, withField(bank, "password", "Neu-2027!"));
    expect((await put(setup, "t-anna", wire(changed))).status).toBe(200);
    const newest = ((await (await setup.request(records, "t-jonas")).json()) as unknown[]).map(
      (r) => EntryRecord.parse(r),
    );
    expect(newest).toEqual([changed, second]);
  });

  it("keeps every version of an entry", async () => {
    const setup = await withVault();
    const first = recordBy(jonas, 1);
    const changed = recordBy(anna, 2, withField(bank, "password", "Neu-2027!"));
    await put(setup, "t-jonas", wire(first));
    await put(setup, "t-anna", wire(changed));
    const response = await setup.request(
      `/api/vaults/${vaultId}/entries/${encodeBytes(entryId)}/versions`,
      "t-max",
    );
    expect(((await response.json()) as unknown[]).map((r) => EntryRecord.parse(r))).toEqual([
      first,
      changed,
    ]);
    const none = await setup.request(
      `/api/vaults/${vaultId}/entries/${encodeBytes(id(9))}/versions`,
      "t-max",
    );
    expect(await none.json()).toEqual([]);
  });

  it("answers anything but the next version with a conflict and the current record", async () => {
    const setup = await withVault();
    const skipped = await put(setup, "t-jonas", wire(recordBy(jonas, 2)));
    expect(skipped.status).toBe(409);
    expect(await skipped.json()).toEqual({ current: null });
    const first = recordBy(jonas, 1);
    await put(setup, "t-jonas", wire(first));
    const again = await put(setup, "t-anna", wire(recordBy(anna, 1)));
    expect(again.status).toBe(409);
    expect(EntryRecord.parse(((await again.json()) as { current: unknown }).current)).toEqual(
      first,
    );
  });

  it("stores only what the session signed itself, for the vault in the path", async () => {
    const setup = await withVault();
    expect((await put(setup, "t-jonas", wire(recordBy(anna, 1)))).status).toBe(403);
    const otherVault = { ...wire(recordBy(jonas, 1)), vaultId: encodeBytes(id(0xb1)) };
    expect((await put(setup, "t-jonas", otherVault)).status).toBe(400);
    expect((await put(setup, "t-jonas", { ...wire(recordBy(jonas, 1)), version: 0 })).status).toBe(
      400,
    );
    expect((await put(setup, "t-jonas", "{")).status).toBe(400);
    expect(await (await setup.request(records, "t-jonas")).json()).toEqual([]);
  });

  it("refuses a record over 1 MiB", async () => {
    const setup = await withVault();
    const huge = { ...wire(recordBy(jonas, 1)), content: "A".repeat(1024 * 1024 + 1) };
    expect((await put(setup, "t-jonas", huge)).status).toBe(413);
  });

  it("does not exist for another company: no reading, writing or listening", async () => {
    const setup = await withVault();
    await put(setup, "t-jonas", wire(recordBy(jonas, 1)));
    expect((await setup.request(records, "t-petra")).status).toBe(404);
    expect(
      (
        await setup.request(
          `/api/vaults/${vaultId}/entries/${encodeBytes(entryId)}/versions`,
          "t-petra",
        )
      ).status,
    ).toBe(404);
    expect((await put(setup, "t-petra", wire(recordBy(jonas, 2)))).status).toBe(404);
    expect((await setup.request(`/api/vaults/${vaultId}/events`, "t-petra")).status).toBe(404);
    expect(ids.petra).not.toBe(ids.jonas);
  });
});

describe("live events", () => {
  it("says ready, then names each stored version, and stops listening when the client goes", async () => {
    const setup = syncSetup({ keepAliveMs: 5 });
    await setup.request("/api/vaults", "t-jonas", { body: { id: vaultId } });
    const controller = new AbortController();
    const response = await setup.app.request(`/api/vaults/${vaultId}/events`, {
      headers: { authorization: "Bearer t-anna" },
      signal: controller.signal,
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (part: string) => {
      while (!text.includes(part))
        text += decoder.decode((await reader.read()).value, { stream: true });
    };
    await until("event: ready");
    expect(setup.app.hub.listening(vaultId)).toBe(1);
    await put(setup, "t-jonas", wire(recordBy(jonas, 1)));
    await until("event: record");
    await until("\n\n");
    expect(text).toContain(`data: {"entryId":"${encodeBytes(entryId)}","version":1}`);
    await until("event: ping");
    controller.abort();
    await reader.cancel();
    for (let i = 0; i < 50 && setup.app.hub.listening(vaultId) > 0; i++) await Bun.sleep(5);
    expect(setup.app.hub.listening(vaultId)).toBe(0);
  });
});

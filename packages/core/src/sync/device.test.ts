import { describe, expect, it } from "vitest";
import { edit, emptyDevice, pull, sync } from "./device.ts";
import { memoryServer, type SyncServer } from "./memory-server.ts";
import { sealRecord } from "./record.ts";
import { bank, contextFor, id, jonas, max, withField } from "./test/fixtures.ts";

const e1 = id(0xe1);
const e2 = id(0xe2);

describe("edit", () => {
  it("queues a change per entry and keeps the base of the first change", async () => {
    let device = edit(emptyDevice(), e1, bank);
    device = edit(device, e2, withField(bank, "user", "zwei"));
    device = edit(device, e1, withField(bank, "user", "eins"));
    expect(device.queue.map((op) => op.content.fields[0]?.value)).toEqual(["eins", "zwei"]);
    expect(device.queue.map((op) => op.base)).toEqual([undefined, undefined]);
  });

  it("starts a change from the version the device knows", async () => {
    const server = memoryServer();
    const device = (await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas))).device;
    expect(edit(device, e1, bank).queue[0]?.base).toEqual({ version: 1, content: bank });
  });
});

describe("sync", () => {
  it("reports records it refused and keeps the rest", async () => {
    const server = memoryServer();
    server.push(
      sealRecord(
        { id: max.id, edSecretKey: max.ed.secretKey },
        contextFor(max).ring,
        e2,
        1,
        bank,
        new Uint8Array(),
      ),
    );
    const result = await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas));
    expect(result.refused).toEqual([{ entryId: e2, version: 1, error: "not-editor" }]);
    expect(result.device.queue).toEqual([]);
  });

  it("gives up after five refused pushes and keeps the change queued", async () => {
    const server = memoryServer();
    let pushes = 0;
    const stubborn: SyncServer = {
      pull: server.pull,
      push: () => ({ ok: false, current: undefined }),
    };
    const counting: SyncServer = {
      ...stubborn,
      push: (r) => {
        pushes++;
        return stubborn.push(r);
      },
    };
    const result = await sync(edit(emptyDevice(), e1, bank), counting, contextFor(jonas));
    expect(pushes).toBe(5);
    expect(result.device.queue).toHaveLength(1);
    expect(result.device.known.size).toBe(0);
  });

  it("does not report the versions it already has as refused", async () => {
    const server = memoryServer();
    const device = (await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas))).device;
    expect((await pull(device, server, contextFor(jonas))).refused).toEqual([]);
  });

  it("pushes a new entry that someone else created first with the same ID as the next version", async () => {
    const server = memoryServer();
    await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas));
    const mine = withField(bank, "user", "mine");
    const result = await sync(edit(emptyDevice(), e1, mine), server, contextFor(jonas));
    expect(server.pull()[0]?.version).toBe(2);
    expect(result.device.known.get("e1".repeat(16))?.content).toEqual(mine);
  });
});

describe("a change without conflict", () => {
  it("is pushed as written, not merged (tags keep their order)", async () => {
    const server = memoryServer();
    const ctx = contextFor(jonas);
    let device = (await sync(edit(emptyDevice(), e1, bank), server, ctx)).device;
    const unsorted = { ...bank, tags: ["Zahlung", "Bank"] };
    device = (await sync(edit(device, e1, unsorted), server, ctx)).device;
    expect(device.known.get("e1".repeat(16))?.content.tags).toEqual(["Zahlung", "Bank"]);
  });
});

describe("memoryServer", () => {
  it("takes only the next version and answers a conflict with the current record", async () => {
    const server = memoryServer();
    const ctx = contextFor(jonas);
    const v1 = sealRecord(ctx.author, ctx.ring, e1, 1, bank, ctx.lastSeen);
    expect(server.push(sealRecord(ctx.author, ctx.ring, e1, 2, bank, ctx.lastSeen))).toEqual({
      ok: false,
      current: undefined,
    });
    expect(server.push(v1)).toEqual({ ok: true });
    expect(server.push(v1)).toEqual({ ok: false, current: v1 });
    expect(server.pull()).toEqual([v1]);
  });
});

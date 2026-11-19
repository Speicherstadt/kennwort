import { describe, expect, it } from "vitest";
import { edit, emptyDevice, pull, sync } from "./device.ts";
import { memoryServer } from "./memory-server.ts";
import { EntryRecord, recordToWire, sealRecord } from "./record.ts";
import { anna, bank, contextFor, id, jonas, max, withField } from "./test/fixtures.ts";

const entryId = id(0xe1);
const contentOf = (device: ReturnType<typeof emptyDevice>) =>
  device.known.get("e1".repeat(16))?.content;

describe("two devices change the same entry offline (K-109)", () => {
  it("lose nothing after both have synced", () => {
    const server = memoryServer();
    // Jonas creates the entry; Anna's laptop and Jonas's phone both have version 1
    let phone = sync(edit(emptyDevice(), entryId, bank), server, contextFor(jonas)).device;
    let laptop = pull(emptyDevice(), server, contextFor(anna)).device;
    expect(contentOf(laptop)).toEqual(bank);

    // Offline: the phone changes the password, the laptop the user name and the password too
    phone = edit(phone, entryId, withField(bank, "password", "Phone-2027!"));
    laptop = edit(
      laptop,
      entryId,
      withField(
        withField(bank, "user", "buero@weber-haustechnik.test"),
        "password",
        "Laptop-2027!",
      ),
    );

    phone = sync(phone, server, contextFor(jonas, 1_800_000_300)).device;
    laptop = sync(laptop, server, contextFor(anna, 1_800_000_400)).device;
    phone = sync(phone, server, contextFor(jonas, 1_800_000_500)).device;

    const merged = contentOf(laptop);
    expect(contentOf(phone)).toEqual(merged);
    expect(merged?.fields.find((f) => f.id === "user")?.value).toBe("buero@weber-haustechnik.test");
    // Both changed the password: the phone's (first on the server) stays, the laptop's is kept in the history
    expect(merged?.fields.find((f) => f.id === "password")?.value).toBe("Phone-2027!");
    expect(merged?.history).toContainEqual({
      fieldId: "password",
      value: "Laptop-2027!",
      replacedAt: 1_800_000_400,
    });
    expect(phone.queue).toEqual([]);
    expect(laptop.queue).toEqual([]);
    expect(server.pull()[0]?.version).toBe(3);
  });

  it("keeps changes queued while offline and sends the newest one as one version", () => {
    const server = memoryServer();
    let device = edit(emptyDevice(), entryId, bank);
    device = edit(device, entryId, withField(bank, "password", "second"));
    expect(device.queue).toHaveLength(1);
    device = sync(device, server, contextFor(jonas)).device;
    expect(server.pull()).toHaveLength(1);
    expect(contentOf(device)?.fields.find((f) => f.id === "password")?.value).toBe("second");
  });
});

describe("pull checks every record (P-09)", () => {
  it("refuses a record by a member who may only read", () => {
    const server = memoryServer();
    server.push(
      sealRecord(
        { id: max.id, edSecretKey: max.ed.secretKey },
        contextFor(max).ring,
        entryId,
        1,
        bank,
        new Uint8Array(),
      ),
    );
    const { device, refused } = pull(emptyDevice(), server, contextFor(anna));
    expect(device.known.size).toBe(0);
    expect(refused).toEqual([{ entryId, version: 1, error: "not-editor" }]);
  });

  it("refuses an older version than the device has seen (E-13)", () => {
    const server = memoryServer();
    const ctx = contextFor(jonas);
    const old = sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen);
    server.push(old);
    let device = pull(emptyDevice(), server, ctx).device;
    device = sync(edit(device, entryId, withField(bank, "password", "new")), server, ctx).device;
    const replaying = { push: server.push, pull: () => [old] };
    const after = pull(device, replaying, ctx);
    expect(contentOf(after.device)?.fields.find((f) => f.id === "password")?.value).toBe("new");
  });

  it("refuses a record whose content was swapped or whose signature is not the author's", () => {
    const ctx = contextFor(jonas);
    const a = sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen);
    const b = sealRecord(
      ctx.author,
      ctx.ring,
      id(0xe2),
      1,
      withField(bank, "password", "other"),
      ctx.lastSeen,
    );
    const swapped = { ...a, content: b.content, entryKey: b.entryKey };
    const forged = { ...a, author: anna.id };
    const server = { push: () => ({ ok: true as const }), pull: () => [swapped, forged] };
    expect(pull(emptyDevice(), server, ctx).refused.map((r) => r.error)).toEqual([
      "bad-signature",
      "bad-signature",
    ]);
  });
});

describe("records on the wire", () => {
  it("parse back from JSON with the Zod schema", () => {
    const ctx = contextFor(jonas);
    const record = sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen);
    const parsed = EntryRecord.parse(JSON.parse(JSON.stringify(recordToWire(record))));
    expect(parsed).toEqual(record);
  });

  it("refuse IDs of the wrong length and text that is not base64url", () => {
    const ctx = contextFor(jonas);
    const wire = recordToWire(sealRecord(ctx.author, ctx.ring, entryId, 1, bank, ctx.lastSeen));
    expect(EntryRecord.safeParse({ ...wire, entryId: "AAAA" }).success).toBe(false);
    expect(EntryRecord.safeParse({ ...wire, content: "a+b/" }).success).toBe(false);
    expect(EntryRecord.safeParse({ ...wire, content: "A" }).success).toBe(false);
    expect(EntryRecord.safeParse({ ...wire, version: 0 }).success).toBe(false);
  });
});

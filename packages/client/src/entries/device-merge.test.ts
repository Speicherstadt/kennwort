import type { EntryContent, Known } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { withPulled, withSynced } from "./device-merge.ts";

// P-11: an entry's epoch never goes back, also where a pull or a sync that started from an older
// device state meets the device as it is now. A load may pull from the device as it stood before a
// rotation wrote the entry anew; a server that kept a member from the rotation answers it with her
// newer version under the old key, which that pull cannot tell from an honest one.

const content = (title: string): EntryContent => ({
  type: "login",
  title,
  fields: [],
  tags: [],
  favorite: false,
  history: [],
});
const entryId = new Uint8Array(16).fill(0xe1);
const known = (version: number, epoch: number, title: string): Known => ({
  entryId,
  version,
  content: content(title),
  key: { entryKey: new Uint8Array(32).fill(epoch + 1), epoch },
});
const device = (k: Known) => ({ known: new Map([["e1", k]]), queue: [] });

describe("merging into the device as it is now", () => {
  const rotated = known(2, 1, "rotated");
  const forked = known(3, 0, "forked");

  it("keeps the version of the later epoch against a pull's newer version of an earlier one", () => {
    expect(withPulled(device(rotated), device(forked)).known.get("e1")).toBe(rotated);
  });

  it("and against a sync's", () => {
    const now = device(rotated);
    expect(withSynced(now, now, device(forked), 0).known.get("e1")).toBe(rotated);
  });

  it("still takes a newer version of the same or a later epoch", () => {
    const later = known(3, 1, "later");
    expect(withPulled(device(rotated), device(later)).known.get("e1")).toBe(later);
    const next = known(4, 2, "next");
    expect(withPulled(device(forked), device(next)).known.get("e1")).toBe(next);
    expect(withPulled(device(later), device(rotated)).known.get("e1")).toBe(later);
  });
});

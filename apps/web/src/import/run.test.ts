import type { EntryContent } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { runImport, type SaveBatch } from "./run.ts";

// K-501: the import writes in batches through the entry store and reports its progress; it stops
// at the first batch the store refuses, and says how far it got
const contents = (n: number) =>
  Array.from(
    { length: n },
    (_, i): EntryContent => ({
      type: "note",
      title: `Notiz ${i}`,
      fields: [],
      tags: [],
      favorite: false,
      history: [],
    }),
  );

const savingAll: SaveBatch = async (batch) => ({
  ok: true,
  value: { saved: batch.map((c) => c.title), unsaved: 0 },
});

describe("runImport", () => {
  it("writes in batches and reports progress after each", async () => {
    const sizes: number[] = [];
    const progress: number[] = [];
    const save: SaveBatch = async (batch) => {
      sizes.push(batch.length);
      return savingAll(batch);
    };
    const done = await runImport(save, contents(5), (n) => progress.push(n), 2);
    expect(sizes).toEqual([2, 2, 1]);
    expect(progress).toEqual([2, 4, 5]);
    expect(done).toEqual({ imported: 5, unsaved: 0 });
  });

  it("stops at a refused batch and says how many were imported before it", async () => {
    let calls = 0;
    const save: SaveBatch = async (batch) => {
      calls += 1;
      return calls === 2 ? { ok: false, error: "rotation-due" } : savingAll(batch);
    };
    expect(await runImport(save, contents(6), () => {}, 2)).toEqual({
      imported: 2,
      unsaved: 4,
      error: "rotation-due",
    });
    expect(calls).toBe(2);
  });

  it("counts entries the server turned away as unsaved and goes on", async () => {
    const save: SaveBatch = async (batch) => ({
      ok: true,
      value: { saved: batch.slice(1).map((c) => c.title), unsaved: 1 },
    });
    expect(await runImport(save, contents(4), () => {}, 2)).toEqual({ imported: 2, unsaved: 2 });
  });
});

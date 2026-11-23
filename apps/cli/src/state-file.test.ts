import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeBytes } from "@kennwort/core";
import { beforeEach, describe, expect, it } from "vitest";
import { stateKeeper } from "./state-file.ts";

let path: string;
beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "kennwort-cli-")), "kennwort", "state.json");
});

const kept = { counter: 7, sealed: new Uint8Array([1, 2, 3, 250]) };

describe("the account state this machine kept", () => {
  it("is written for the owner only and read back", () => {
    const keeper = stateKeeper(path);
    expect(keeper.keep(kept)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(keeper.read()).toEqual(kept);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      counter: 7,
      sealed: encodeBytes(kept.sealed),
    });
  });

  it("is nothing when there is none or it is damaged; the next write replaces it", () => {
    const keeper = stateKeeper(path);
    expect(keeper.read()).toBeUndefined();
    keeper.keep(kept);
    for (const text of [
      "nonsense",
      "{}",
      JSON.stringify({ version: 1, counter: -1, sealed: "AQ" }),
    ]) {
      writeFileSync(path, text, { mode: 0o600 });
      expect(keeper.read()).toBeUndefined();
    }
  });
});

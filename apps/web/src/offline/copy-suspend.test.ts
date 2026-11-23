import { describe, expect, it } from "vitest";
import { memoryKeyValue } from "./key-value.ts";
import { createLocalCopy } from "./local-copy.ts";

// K-605: while another company of the account is on screen, its answers stay out of the home's copy
const JONAS = "AAAAAAAAAAAAAAAAAAAAAA";
const weber = { vaults: [{ id: "CCCCCCCCCCCCCCCCCCCCCC", name: null, nameEpoch: null }] };
const mueller = { vaults: [{ id: "DDDDDDDDDDDDDDDDDDDDDD", name: null, nameEpoch: null }] };

describe("the offline copy while another company is on screen", () => {
  it("keeps and serves nothing until it is the home's again", async () => {
    const copy = createLocalCopy(memoryKeyValue(), () => 1);
    await copy.useAccount(JONAS);
    let answer: unknown = weber;
    let up = true;
    const send = copy.fetch(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return Response.json(answer);
    });
    await send("/api/vaults");
    copy.suspend(true);
    answer = mueller;
    await send("/api/vaults");
    up = false;
    // Offline with the other company on screen: nothing from the copy
    await expect(send("/api/vaults")).rejects.toThrow("Failed to fetch");
    copy.suspend(false);
    // The home's own answer, not the other company's
    expect(await (await send("/api/vaults")).json()).toEqual(weber);
  });
});

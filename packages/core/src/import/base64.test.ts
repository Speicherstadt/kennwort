import { describe, expect, it } from "vitest";
import { fromBase64 } from "./base64.ts";

describe("Base64 as KeePass writes it", () => {
  it("reads padded standard Base64", () => {
    expect(fromBase64("V2ViZXI=")).toEqual(new TextEncoder().encode("Weber"));
    expect(fromBase64("SGF1cw==")).toEqual(new TextEncoder().encode("Haus"));
    expect(fromBase64("TWF4")).toEqual(new TextEncoder().encode("Max"));
    expect(fromBase64("+/+/")).toEqual(Uint8Array.of(0xfb, 0xff, 0xbf));
    expect(fromBase64("")).toEqual(new Uint8Array());
  });

  it("refuses what atob would let through", () => {
    for (const text of ["V2ViZXI", "TWF 4", "-_-_", "TWF4=", "T===", "TWF4\n"]) {
      expect([text, fromBase64(text)]).toEqual([text, undefined]);
    }
  });
});

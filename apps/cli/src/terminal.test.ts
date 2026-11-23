import { describe, expect, it } from "vitest";
import { firstLine, type Typing, typed } from "./terminal.ts";

const start: Typing = { text: "", state: "typing" };
const typeAll = (...chunks: string[]) => chunks.reduce(typed, start);

describe("typing on the terminal", () => {
  it("collects the characters up to Enter", () => {
    expect(typeAll("Heiz", "ung\r")).toEqual({ text: "Heizung", state: "done" });
    expect(typeAll("Kupfer\n")).toEqual({ text: "Kupfer", state: "done" });
  });

  it("takes what follows Enter in the same chunk as not typed", () => {
    expect(typeAll("ja\rnein")).toEqual({ text: "ja", state: "done" });
  });

  it("deletes with backspace, by character and not by byte, and clears with Ctrl-U", () => {
    expect(typeAll("Büro", "\x7f", "\x7f", "\b", "a\r")).toEqual({ text: "Ba", state: "done" });
    expect(typeAll("😀x", "\x7f\x7f\r")).toEqual({ text: "", state: "done" });
    expect(typeAll("geheim", "\x15", "neu\r")).toEqual({ text: "neu", state: "done" });
  });

  it("aborts with Ctrl-C, and with Ctrl-D on an empty line", () => {
    expect(typeAll("geheim", "\x03")).toEqual({ text: "", state: "aborted" });
    expect(typeAll("\x04")).toEqual({ text: "", state: "aborted" });
    expect(typeAll("a\x04b\r")).toEqual({ text: "ab", state: "done" });
  });

  it("ignores escape sequences such as the arrow keys and other control characters", () => {
    expect(typeAll("a\x1b[D\x1b[Cb\t\r")).toEqual({ text: "ab", state: "done" });
  });

  it("takes pasted text with its spaces", () => {
    expect(typeAll("Heizung Wasser Licht\r")).toEqual({
      text: "Heizung Wasser Licht",
      state: "done",
    });
  });
});

describe("the passphrase from stdin", () => {
  it("is the first line, without its line ending", () => {
    expect(firstLine("Heizung-Wasser\nrest")).toBe("Heizung-Wasser");
    expect(firstLine("Heizung-Wasser\r\n")).toBe("Heizung-Wasser");
    expect(firstLine("ohne Zeilenende")).toBe("ohne Zeilenende");
  });

  it("is nothing when stdin is empty", () => {
    expect(firstLine("")).toBeUndefined();
  });
});

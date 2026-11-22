import { describe, expect, it } from "vitest";
import { lineCount, oversized } from "./file-size.ts";

describe("the file size rule (checks.json, firsttris/workflows)", () => {
  it("counts lines like wc -l", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a\n")).toBe(1);
    expect(lineCount("a\nb")).toBe(1);
    expect(lineCount("a\nb\n")).toBe(2);
  });

  it("reports a source file past 400 lines and leaves tests and short files alone", () => {
    const files = [
      { path: "packages/core/src/index.ts", text: "x\n".repeat(401) },
      { path: "packages/core/src/ok.ts", text: "x\n".repeat(400) },
      { path: "apps/server/src/big.test.ts", text: "x\n".repeat(900) },
      { path: "apps/web/src/page.test.tsx", text: "x\n".repeat(900) },
    ];
    expect(oversized(files)).toEqual([{ path: "packages/core/src/index.ts", lines: 401 }]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseWithoutEval } from "./without-eval.ts";

describe("parseWithoutEval", () => {
  afterEach(() => {
    z.config({ jitless: false });
  });

  it("makes Zod parse without compiling code, and still parse", () => {
    z.config({ jitless: false });
    parseWithoutEval();
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.number() }).parse({ a: 1 })).toEqual({ a: 1 });
  });
});

/**
 * Fuzzing Bitwarden's password-protected JSON (K-502 Teil 4): an export changed at random, with
 * the password, never throws and never gives entries other than its own; random KDF parameters
 * never get past the limits, and no file makes the check derive anything.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseBitwardenJson } from "./bitwarden-json.ts";
import { checkBitwardenJson, unlockBitwardenJson } from "./bitwarden-protected.ts";
import { exportBytes, protectedExport, TEST_PASSWORD } from "./test/bitwarden.ts";
import { compact, fixtureText } from "./test/helpers.ts";

const plain = fixtureText("bitwarden.json");
const doc = protectedExport(plain);
const text = JSON.stringify(doc);
const entries = compact(parseBitwardenJson(plain));

/** The export's text with characters replaced, cut or put in at random */
const brokenText = fc
  .array(
    fc.tuple(fc.nat(), fc.constantFrom("A", "/", "+", "=", "|", "2", '"', "}", ""), fc.boolean()),
    { minLength: 1, maxLength: 4 },
  )
  .map((edits) => {
    let broken = text;
    for (const [at, value, insert] of edits) {
      const index = at % (broken.length + 1);
      broken = broken.slice(0, index) + value + broken.slice(index + (insert ? 0 : 1));
    }
    return broken;
  });

const anything = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.string(),
  fc.constant(null),
  fc.boolean(),
  fc.constantFrom(5000, 2_000_000, 2_000_001, 16, 1024, 1025, 0, -1),
);

describe("Bitwarden's password-protected JSON under fuzzing", () => {
  it("answers an export changed at random with its own entries or an error", async () => {
    await fc.assert(
      fc.asyncProperty(brokenText, async (broken) => {
        const result = await unlockBitwardenJson(new TextEncoder().encode(broken), {
          password: TEST_PASSWORD,
        });
        if (result.ok) expect(compact(result)).toEqual(entries);
        else expect(typeof result.error).toBe("string");
      }),
      { numRuns: 60 },
    );
  });

  it("lets no KDF parameters past the check but those within the limits", () => {
    fc.assert(
      fc.property(anything, anything, anything, anything, (type, iterations, memory, threads) => {
        const file = { ...doc, kdfType: type, kdfIterations: iterations };
        const result = checkBitwardenJson(
          exportBytes({ ...file, kdfMemory: memory, kdfParallelism: threads }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok && result.error === "encrypted") {
          const pbkdf2 = type === 0 && Number(iterations) <= 2_000_000;
          const argon2 = type === 1 && Number(memory) <= 1024 && Number(threads) <= 16;
          expect(pbkdf2 || (argon2 && Number(iterations) <= 10)).toBe(true);
        }
      }),
    );
  });
});

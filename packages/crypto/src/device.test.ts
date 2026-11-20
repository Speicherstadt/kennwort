import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deviceCode, deviceFingerprint } from "./device.ts";
import { bundleFingerprint, recoveryFingerprint } from "./fingerprint.ts";
import { hex } from "./test-helpers.ts";

// P-04: the vectors below were computed with SHA-512/256 from node:crypto over enc() of the inputs
const pk = new Uint8Array(1216).fill(7);

describe("deviceFingerprint", () => {
  it("matches the vector and differs from the other fingerprints of the same key", () => {
    expect(hex(deviceFingerprint(pk))).toBe(
      "698828bd5418ddaf6f00dce462cb8ac7abab78f43dd6aefd5cb4996aeabf8d1f",
    );
    expect(hex(deviceFingerprint(pk))).not.toBe(hex(recoveryFingerprint(pk)));
    expect(hex(deviceFingerprint(pk))).not.toBe(hex(bundleFingerprint(pk, new Uint8Array(32))));
  });
});

describe("deviceCode", () => {
  it("matches the vectors, leading zeros included", () => {
    expect(deviceCode(pk, new Uint8Array(100).fill(9))).toBe("620851");
    expect(deviceCode(pk, new Uint8Array([8]))).toBe("037768");
  });

  it("is always six digits and changes with the key or the package", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 64 }),
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        (key, pkg) => {
          expect(deviceCode(key, pkg)).toMatch(/^\d{6}$/);
        },
      ),
      { numRuns: 200 },
    );
    const base = deviceCode(pk, new Uint8Array([1, 2, 3]));
    expect(deviceCode(pk, new Uint8Array([1, 2, 4]))).not.toBe(base);
    expect(deviceCode(new Uint8Array(1216).fill(8), new Uint8Array([1, 2, 3]))).not.toBe(base);
  });
});

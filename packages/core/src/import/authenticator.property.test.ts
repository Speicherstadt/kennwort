/**
 * Fuzzing the authenticator imports (K-503) past their first checks: migration links with random
 * payloads and accounts with random settings, Aegis and 2FAS exports with random values in each
 * field. None may throw or hang, and every code that comes out is one Kennwort can work out.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTotp } from "../totp/otpauth.ts";
import { parseAegisJson } from "./aegis-json.ts";
import { parseGoogleMigration } from "./google-migration.ts";
import { type Field, message, migrationLink, otpParameters } from "./test/protobuf.ts";
import { parseTwoFasJson } from "./twofas-json.ts";
import type { ImportResult } from "./types.ts";

/** Entries and the skipped ones add up to the accounts, and every code works */
const sound = (result: ImportResult, accounts?: number) => {
  if (!result.ok) return typeof result.error === "string";
  const codes = result.value.map(
    (entry) => entry.content.fields.find((f) => f.kind === "totp")?.value ?? "",
  );
  expect(codes.every((code) => parseTotp(code).ok)).toBe(true);
  if (accounts !== undefined) expect(result.value.length + (result.skipped ?? 0)).toBe(accounts);
  return true;
};

const small = fc.integer({ min: -1, max: 6 });
const name = fc.string({ unit: fc.constantFrom("a", "ä", ":", " ", "%", "🔥", "\uD800") });
const otp = fc.record({
  secret: fc.uint8Array({ maxLength: 40 }),
  name,
  issuer: fc.option(name, { nil: undefined }),
  algorithm: fc.nat({ max: 6 }),
  digits: fc.nat({ max: 4 }),
  type: fc.nat({ max: 4 }),
  counter: fc.option(fc.maxSafeNat(), { nil: undefined }),
});

describe("authenticator imports under fuzzing (K-503)", () => {
  it("reads any accounts of a migration payload or counts them as skipped", () => {
    fc.assert(
      fc.property(fc.array(otp, { maxLength: 6 }), (otps) => {
        const payload = message(otps.map((o): Field => [1, otpParameters(o)]));
        return sound(parseGoogleMigration(migrationLink(payload)), otps.length);
      }),
      { numRuns: 300 },
    );
  });

  it("answers a migration link with random bytes as its payload", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uint8Array({ maxLength: 120 }), { minLength: 1, maxLength: 4 }),
        (payloads) => sound(parseGoogleMigration(payloads.map(migrationLink).join("\n"))),
      ),
      { numRuns: 300 },
    );
  });

  it("answers random batch numbers, however large", () => {
    const batch = fc.tuple(fc.maxSafeNat(), fc.maxSafeNat(), fc.nat({ max: 3 }));
    fc.assert(
      fc.property(fc.array(batch, { minLength: 1, maxLength: 5 }), (batches) => {
        const links = batches.map(([size, index, id]) =>
          migrationLink(
            message([
              [1, otpParameters({ secret: new Uint8Array([1]), name: "a" })],
              [3, size],
              [4, index],
              [5, id],
            ]),
          ),
        );
        return sound(parseGoogleMigration(links.join("\n")));
      }),
      { numRuns: 300 },
    );
  });

  const value = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.constant(null),
    small,
  );
  const settings = fc.record(
    {
      secret: fc.oneof(fc.constantFrom("JBSWY3DPEHPK3PXP", "", "kein", "jbswy3dp"), value),
      algo: fc.oneof(fc.constantFrom("SHA1", "sha256", "MD5"), value),
      algorithm: fc.oneof(fc.constantFrom("SHA512", ""), value),
      digits: fc.oneof(small, fc.integer({ min: 5, max: 9 }), value),
      period: fc.oneof(fc.integer({ min: -1, max: 90_000 }), value),
      tokenType: fc.oneof(fc.constantFrom("TOTP", "HOTP", "STEAM", ""), value),
    },
    { requiredKeys: [] },
  );

  it("reads any Aegis entries or counts them as skipped", () => {
    const entry = fc.record(
      {
        type: fc.oneof(fc.constantFrom("totp", "hotp", "steam"), value),
        name: value,
        issuer: value,
        note: value,
        favorite: value,
        groups: fc.oneof(fc.array(fc.string()), value),
        group: value,
        info: fc.oneof(settings, value),
      },
      { requiredKeys: ["info"] },
    );
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 5 }), (entries) => {
        const json = JSON.stringify({
          version: 1,
          header: { slots: null },
          db: { entries, groups: [] },
        });
        const result = parseAegisJson(json);
        return sound(result, result.ok ? entries.length : undefined);
      }),
      { numRuns: 300 },
    );
  });

  it("reads any 2FAS services or counts them as skipped", () => {
    const service = fc.record(
      { name: value, secret: value, groupId: value, otp: fc.oneof(settings, value) },
      { requiredKeys: ["otp"] },
    );
    fc.assert(
      fc.property(fc.array(service, { maxLength: 5 }), (services) => {
        const result = parseTwoFasJson(JSON.stringify({ schemaVersion: 4, services, groups: [] }));
        return sound(result, result.ok ? services.length : undefined);
      }),
      { numRuns: 300 },
    );
  });

  it("answers long pastes quickly", () => {
    const one = migrationLink(
      message([[1, otpParameters({ secret: new Uint8Array([1, 2]), name: "a" })]]),
    );
    const many = Array.from({ length: 20_000 }, (_, i) =>
      migrationLink(
        message([
          [1, otpParameters({ secret: new Uint8Array([1, 2]), name: "a" })],
          [3, 20_000],
          [4, i],
          [5, 1],
        ]),
      ),
    );
    expect(parseGoogleMigration(many.join("\n"))).toMatchObject({ ok: true, skipped: 0 });
    expect(parseGoogleMigration(`${one}\n`.repeat(20_000))).toMatchObject({ ok: true });
    expect(parseGoogleMigration(" ".repeat(1_000_000))).toEqual({
      ok: false,
      error: "wrong-format",
    });
  }, 30_000);
});

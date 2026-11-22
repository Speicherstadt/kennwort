import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { err, ok } from "../result.ts";
import { createLeakCheck, type FetchRange, LEAK_CONCURRENCY } from "./leak-check.ts";

/** SHA-1 by node:crypto, apart from the code under test */
const sha1 = (password: string) => createHash("sha1").update(password).digest("hex").toUpperCase();

const LEAKED: Record<string, number> = { password: 9_545_824, sommer2019: 412, Hallo123: 77 };

/** A padded range as the service sends it: the leaked suffixes under the prefix, and made-up ones with 0 */
const rangeOf = (prefix: string) => {
  const lines = Object.entries(LEAKED)
    .filter(([password]) => sha1(password).startsWith(prefix))
    .map(([password, count]) => `${sha1(password).slice(5)}:${count}`);
  const padding = Array.from({ length: 5 }, (_, i) => `${String(i).repeat(35)}:0`);
  // A padding line with the suffix of a password that did not leak: count 0 is no leak
  const decoy = `${sha1("Kessel-Pumpe-Rohr-7!").slice(5)}:0`;
  return [...padding, ...lines, decoy].join("\r\n");
};

const recording = (answer: FetchRange = async (prefix) => ok(rangeOf(prefix))) => {
  const asked: string[] = [];
  const fetchRange: FetchRange = (prefix) => {
    asked.push(prefix);
    return answer(prefix);
  };
  return { asked, check: createLeakCheck(fetchRange) };
};

describe("createLeakCheck", () => {
  it("sends nothing while the check is off", async () => {
    const { asked, check } = recording();
    expect(await check.check(["password", "sommer2019"], false)).toEqual(err("off"));
    expect(asked).toEqual([]);
  });

  it("asks only for the five-character prefix and finds the leaked passwords by the suffix", async () => {
    const { asked, check } = recording();
    const result = await check.check(["password", "Kessel-Pumpe-Rohr-7!", "sommer2019"], true);
    expect(result.ok && [...result.value].sort()).toEqual([
      ["password", 9_545_824],
      ["sommer2019", 412],
    ]);
    for (const prefix of asked) expect(prefix).toMatch(/^[0-9A-F]{5}$/);
    expect(asked.sort()).toEqual(
      ["password", "Kessel-Pumpe-Rohr-7!", "sommer2019"].map((p) => sha1(p).slice(0, 5)).sort(),
    );
  });

  it("never sends a password, its suffix or more than the prefix", async () => {
    const { asked, check } = recording();
    await check.check(["Hallo123"], true);
    expect(asked).toEqual([sha1("Hallo123").slice(0, 5)]);
    expect(asked.join()).not.toContain("Hallo123");
    expect(asked.join()).not.toContain(sha1("Hallo123").slice(5));
  });

  it("asks for each prefix once, in sorted order, and skips empty passwords", async () => {
    const { asked, check } = recording();
    const passwords = ["Hallo123", "password", "password", "", "Rohr-9", "sommer2019"];
    await check.check(passwords, true);
    const expected = [
      ...new Set(["Hallo123", "password", "Rohr-9", "sommer2019"].map((p) => sha1(p).slice(0, 5))),
    ].sort();
    expect(asked).toEqual(expected);
  });

  it("keeps each range in memory: a second check asks for new prefixes only", async () => {
    const { asked, check } = recording();
    await check.check(["password"], true);
    const second = await check.check(["password", "Hallo123"], true);
    expect(asked).toEqual([sha1("password").slice(0, 5), sha1("Hallo123").slice(0, 5)]);
    expect(second.ok && second.value.get("password")).toBe(9_545_824);
    expect(second.ok && second.value.get("Hallo123")).toBe(77);
  });

  it(`asks for at most ${LEAK_CONCURRENCY} ranges at a time`, async () => {
    let open = 0;
    let most = 0;
    const { asked, check } = recording(async (prefix) => {
      open++;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 1));
      open--;
      return ok(rangeOf(prefix));
    });
    const passwords = Array.from({ length: 10 }, (_, i) => `Passwort-${i}`);
    const result = await check.check(passwords, true);
    expect(result.ok).toBe(true);
    expect(most).toBe(LEAK_CONCURRENCY);
    expect(new Set(asked).size).toBe(10);
  });

  it("fails when one range of a batch fails, though the others came", async () => {
    const passwords = ["password", "Hallo123", "sommer2019"];
    const failing = [...passwords.map((p) => sha1(p).slice(0, 5))].sort()[1];
    const { check } = recording(async (prefix) =>
      prefix === failing ? err("unreachable") : ok(rangeOf(prefix)),
    );
    expect(await check.check(passwords, true)).toEqual(err("unreachable"));
  });

  it("stops at the first batch that fails, says why, and asks for a failed range again", async () => {
    let fail = true;
    const { asked, check } = recording(async (prefix) =>
      fail ? err("limited") : ok(rangeOf(prefix)),
    );
    expect(await check.check(["password"], true)).toEqual(err("limited"));
    fail = false;
    const again = await check.check(["password"], true);
    expect(again.ok && again.value.get("password")).toBe(9_545_824);
    expect(asked).toEqual([sha1("password").slice(0, 5), sha1("password").slice(0, 5)]);
  });

  it("asks no further batch after a failed one", async () => {
    const { asked, check } = recording(async () => err("unreachable"));
    const passwords = Array.from({ length: 10 }, (_, i) => `Passwort-${i}`);
    expect(await check.check(passwords, true)).toEqual(err("unreachable"));
    expect(asked).toHaveLength(LEAK_CONCURRENCY);
  });

  it("refuses an answer that is no range and keeps nothing of it", async () => {
    let html = true;
    const { asked, check } = recording(async (prefix) =>
      html ? ok("<html>Wartung</html>") : ok(rangeOf(prefix)),
    );
    expect(await check.check(["password"], true)).toEqual(err("malformed"));
    html = false;
    expect((await check.check(["password"], true)).ok).toBe(true);
    expect(asked).toHaveLength(2);
  });

  it("finds nothing for passwords that are not in the list", async () => {
    const { check } = recording();
    const result = await check.check(["Kessel-Pumpe-Rohr-7!"], true);
    expect(result.ok && result.value.size).toBe(0);
  });
});

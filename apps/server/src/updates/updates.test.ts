import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import type { NotifyEvent } from "../notifications/notify.ts";
import { SERVER_VERSION } from "../version.ts";
import {
  isNewer,
  latestRelease,
  MAX_RELEASE_LENGTH,
  parseVersion,
  RELEASES_URL,
} from "./releases.ts";
import {
  CHECK_EVERY_MS,
  checkForUpdate,
  FIRST_CHECK_MS,
  startUpdateCheck,
  type Timers,
} from "./update-check.ts";

/** A fake release host: records every request and answers as told */
const fakeHost = (answer: (url: string) => Response | Promise<Response>) => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return answer(String(input));
  }) as typeof globalThis.fetch;
  return { fetch, requests };
};

const release = (tag: string) => Response.json({ tag_name: tag, body: "notes", draft: false });

describe("latestRelease", () => {
  it("asks GitHub's fixed https address with a plain GET, no redirect, nothing else", async () => {
    const host = fakeHost(() => release("v1.4.2"));
    expect(await latestRelease(host.fetch)).toEqual([1, 4, 2]);
    expect(RELEASES_URL).toBe(
      "https://api.github.com/repos/Speicherstadt/kennwort/releases/latest",
    );
    expect(host.requests).toHaveLength(1);
    const [{ url, init }] = host.requests as [(typeof host.requests)[number]];
    expect(url).toBe(RELEASES_URL);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.body).toBeUndefined();
    // No version, no host name, no cookie or token: only what GitHub requires
    expect(init?.headers).toEqual({
      Accept: "application/vnd.github+json",
      "User-Agent": "Kennwort",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives nothing for an error, a redirect it refused, or an answer that is no release", async () => {
    const answers = [
      () => new Response("rate limited", { status: 403 }),
      () => Promise.reject(new TypeError("redirect was not allowed")),
      () => new Response("not json"),
      () => Response.json({ name: "no tag" }),
      () => release("v1.5.0-rc.1"),
      () => release("latest"),
      () => release(`v1.0.0${"x".repeat(100)}`),
      () => new Response("x".repeat(MAX_RELEASE_LENGTH + 1)),
    ];
    for (const answer of answers)
      expect(await latestRelease(fakeHost(answer).fetch)).toBeUndefined();
  });
});

describe("versions", () => {
  it("reads X.Y.Z with or without v, and nothing else", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("10.20.30")).toEqual([10, 20, 30]);
    for (const text of ["1.2", "v1.2.3-rc.1", "1.2.3 ", "v1.2.x", ""])
      expect(parseVersion(text)).toBeUndefined();
  });

  it("compares part by part as numbers", () => {
    expect(isNewer([1, 10, 0], [1, 9, 9])).toBe(true);
    expect(isNewer([2, 0, 0], [1, 99, 99])).toBe(true);
    expect(isNewer([1, 2, 3], [1, 2, 3])).toBe(false);
    expect(isNewer([1, 2, 2], [1, 2, 3])).toBe(false);
  });

  it("names the version of package.json, which the release workflow checks against the tag", () => {
    const root = join(import.meta.dirname, "..", "..", "..", "..");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

/** Two companies, as K-605 allows, each with an owner, an admin and a member */
const weber = () => {
  const db = openDatabase(":memory:");
  migrate(db);
  for (const company of ["weber", "mueller"]) {
    db.insert(companies).values({ id: company, createdAt: 1 }).run();
    for (const role of ["owner", "admin", "member"] as const)
      db.insert(accounts)
        .values({ id: `${company}-${role}`, companyId: company, role, createdAt: 1 } as never)
        .run();
  }
  const events: NotifyEvent[] = [];
  return { db, events, notify: (event: NotifyEvent) => void events.push(event) };
};

const deps = (w: ReturnType<typeof weber>, tag: string | undefined, current = "1.0.0") => ({
  db: w.db,
  notify: w.notify,
  now: () => 5,
  current,
  latest: async () => (tag === undefined ? undefined : parseVersion(tag)),
});

describe("checkForUpdate", () => {
  it("tells the owners and admins of every company of a newer release, members not", async () => {
    const w = weber();
    expect(await checkForUpdate(deps(w, "v1.1.0"))).toBe("1.1.0");
    const byCompany = [...w.events].sort((a, b) => a.companyId.localeCompare(b.companyId));
    expect(byCompany).toEqual(
      ["mueller", "weber"].map((company) => ({
        companyId: company,
        recipients: [`${company}-owner`, `${company}-admin`],
        kind: "update-available",
      })),
    );
  });

  it("tells once per release, after a restart too, and again for the next one", async () => {
    const w = weber();
    await checkForUpdate(deps(w, "v1.1.0"));
    expect(await checkForUpdate(deps(w, "v1.1.0"))).toBeUndefined();
    expect(w.events).toHaveLength(2);
    expect(await checkForUpdate(deps(w, "v1.2.0"))).toBe("1.2.0");
    expect(w.events).toHaveLength(4);
    // A release taken back, so the newest is older than one announced: nothing
    expect(await checkForUpdate(deps(w, "v1.1.5"))).toBeUndefined();
    expect(w.events).toHaveLength(4);
  });

  it("says nothing for the same or an older release, or without an answer", async () => {
    const w = weber();
    for (const tag of ["v1.0.0", "v0.9.9", undefined])
      expect(await checkForUpdate(deps(w, tag))).toBeUndefined();
    expect(w.events).toEqual([]);
  });
});

describe("startUpdateCheck", () => {
  it("checks a while after the start and then once a day", async () => {
    const w = weber();
    const planned: { ms: number; repeat: boolean; run: () => void }[] = [];
    const timers: Timers = {
      after: (ms, run) => void planned.push({ ms, repeat: false, run }),
      every: (ms, run) => void planned.push({ ms, repeat: true, run }),
    };
    let asked = 0;
    startUpdateCheck(
      {
        ...deps(w, "v2.0.0"),
        latest: async () => {
          asked += 1;
          return parseVersion("v2.0.0");
        },
      },
      timers,
    );
    expect(asked).toBe(0);
    expect(planned.map(({ ms, repeat }) => ({ ms, repeat }))).toEqual([
      { ms: FIRST_CHECK_MS, repeat: false },
    ]);
    planned[0]?.run();
    expect(planned.map(({ ms, repeat }) => ({ ms, repeat }))[1]).toEqual({
      ms: CHECK_EVERY_MS,
      repeat: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toBe(1);
  });
});

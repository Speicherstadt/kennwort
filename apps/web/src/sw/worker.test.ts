import { appHeaders, appPolicy } from "@kennwort/core/headers";
import { describe, expect, it } from "vitest";
import { loadState } from "./cache-store.ts";
import {
  build,
  fakeServer,
  memoryCaches,
  ORIGIN,
  OTHER_KEYS,
  publish,
  RELEASE_KEYS,
} from "./test-doubles.ts";
import { activate, check, install, respond, type WorkerDeps } from "./worker.ts";

const setUp = () => {
  const server = fakeServer();
  const caches = memoryCaches();
  const deps: WorkerDeps = {
    fetch: server.fetch,
    caches,
    origin: ORIGIN,
    publicKey: RELEASE_KEYS.publicKey,
  };
  return { server, caches, deps };
};

const navigate = (deps: WorkerDeps, path = "/") =>
  respond(deps, { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" });
const asset = (deps: WorkerDeps, path: string) =>
  respond(deps, { url: `${ORIGIN}${path}`, method: "GET", mode: "cors" });
const page = async (deps: WorkerDeps, path = "/") => (await navigate(deps, path))?.text();
const assetText = async (deps: WorkerDeps, path: string) => (await asset(deps, path))?.text();

/** A worker installed with v1 */
const installedV1 = async () => {
  const setup = setUp();
  setup.server.serve(publish(build("v1"), 1).published);
  expect((await install(setup.deps)).ok).toBe(true);
  await activate(setup.deps);
  return setup;
};

describe("install", () => {
  it("verifies v1 and serves its files from then on, without the server", async () => {
    const { server, deps } = await installedV1();
    server.serve(new Map());
    expect(await page(deps)).toContain("<title>v1</title>");
    expect(await page(deps, "/entries")).toContain("<title>v1</title>");
    expect(await assetText(deps, "/assets/index-v1.js")).toBe('console.log("v1")');
  });

  it("fails on a file whose hash differs, and serves nothing", async () => {
    const { server, deps } = setUp();
    server.serve(publish(build("v1"), 1).published);
    server.tamper("/assets/index-v1.js", "steal()");
    expect(await install(deps)).toEqual({ ok: false, error: "hash", path: "/assets/index-v1.js" });
    expect(await navigate(deps)).toBeNull();
    expect(await asset(deps, "/assets/index-v1.js")).toBeNull();
  });

  it("fails on a signature by another key", async () => {
    const { server, deps } = setUp();
    server.serve(publish(build("v1"), 1, OTHER_KEYS.secretKey).published);
    expect(await install(deps)).toEqual({ ok: false, error: "signature" });
    expect(await navigate(deps)).toBeNull();
  });

  it("fails on a missing file or a missing manifest", async () => {
    const { server, deps } = setUp();
    server.serve(publish(build("v1"), 1).published);
    server.remove("/index.html");
    expect(await install(deps)).toEqual({ ok: false, error: "missing", path: "/index.html" });
    server.remove("/release.sig");
    expect(await install(deps)).toEqual({ ok: false, error: "network" });
  });

  it("fails when the server is unreachable", async () => {
    const { deps } = setUp();
    const offline: WorkerDeps = { ...deps, fetch: () => Promise.reject(new TypeError("offline")) };
    expect(await install(offline)).toEqual({ ok: false, error: "network" });
  });
});

describe("check", () => {
  it("keeps v1 when the server offers v2 with a file changed after signing", async () => {
    const { server, deps } = await installedV1();
    server.serve(publish(build("v2"), 2).published);
    server.tamper("/index.html", "<title>v2 tampered</title>");
    expect(await check(deps)).toEqual({ ready: false, refused: "hash" });
    expect(await page(deps)).toContain("<title>v1</title>");
  });

  it("keeps v1 when v2 is signed by another key", async () => {
    const { server, deps } = await installedV1();
    server.serve(publish(build("v2"), 2, OTHER_KEYS.secretKey).published);
    expect(await check(deps)).toEqual({ ready: false, refused: "signature" });
    expect(await page(deps)).toContain("<title>v1</title>");
    expect(server.asked).not.toContain("/assets/index-v2.js");
  });

  it("does not fetch an older or the same release again", async () => {
    const { server, deps } = await installedV1();
    server.serve(publish(build("v0"), 0).published);
    expect(await check(deps)).toEqual({ ready: false });
    server.serve(publish(build("v1"), 1).published);
    expect(await check(deps)).toEqual({ ready: false });
    expect(server.asked.filter((path) => path.startsWith("/assets/"))).toEqual([
      "/assets/index-v1.js",
    ]);
  });

  it("readies a correct v2 and switches to it at the next navigation, not before", async () => {
    const { server, caches, deps } = await installedV1();
    server.serve(publish(build("v2"), 2).published);
    expect(await check(deps)).toEqual({ ready: true });
    // A running v1 page still finds its own files; v1 stays the page until the next navigation
    expect(await assetText(deps, "/assets/index-v1.js")).toBe('console.log("v1")');
    expect(await check(deps)).toEqual({ ready: true });
    expect((await loadState(caches, ORIGIN)).current?.sequence).toBe(1);
    expect(await page(deps)).toContain("<title>v2</title>");
    expect(await assetText(deps, "/assets/index-v2.js")).toBe('console.log("v2")');
    // The tab still open on v1 loads its files lazily from the version before
    expect(await assetText(deps, "/assets/index-v1.js")).toBe('console.log("v1")');
    expect((await loadState(caches, ORIGIN)).ready).toBeNull();
    expect(await check(deps)).toEqual({ ready: false });
  });

  it("keeps a ready v2 when a later offer fails", async () => {
    const { server, deps } = await installedV1();
    server.serve(publish(build("v2"), 2).published);
    await check(deps);
    server.serve(publish(build("v3"), 3, OTHER_KEYS.secretKey).published);
    expect(await check(deps)).toEqual({ ready: true, refused: "signature" });
    server.serve(publish(build("v3"), 3).published);
    server.remove("/assets/index-v3.js");
    expect(await check(deps)).toEqual({ ready: true, refused: "missing" });
    expect(await page(deps)).toContain("<title>v2</title>");
  });

  it("drops the caches of versions it no longer holds", async () => {
    const { server, caches, deps } = await installedV1();
    for (const version of [2, 3]) {
      server.serve(publish(build(`v${version}`), version).published);
      await check(deps);
      await navigate(deps);
    }
    const names = await caches.keys();
    expect(names.filter((name) => name.startsWith("kennwort-release-"))).toHaveLength(2);
    // A tab still on v1 gets an error for its file, never the server's unchecked copy
    server.serve(publish(build("v1"), 1).published);
    expect((await asset(deps, "/assets/index-v1.js"))?.status).toBe(404);
  });

  it("refuses to install a release older than one it ever verified", async () => {
    const { server, deps } = await installedV1();
    server.serve(publish(build("v2"), 2).published);
    await check(deps);
    server.serve(publish(build("v1"), 1).published);
    expect(await install(deps)).toEqual({ ok: false, error: "older" });
    // The same release again, as a new worker installs it, is fine
    server.serve(publish(build("v2"), 2).published);
    expect((await install(deps)).ok).toBe(true);
    expect(await page(deps)).toContain("<title>v2</title>");
  });
});

describe("respond", () => {
  it("leaves the server's paths, other origins and other methods to the network", async () => {
    const { deps } = await installedV1();
    const asked = (url: string, method = "GET") => respond(deps, { url, method, mode: "cors" });
    expect(await asked(`${ORIGIN}/api/vaults`)).toBeNull();
    expect(await asked(`${ORIGIN}/auth`)).toBeNull();
    expect(await asked("https://elsewhere.test/assets/index-v1.js")).toBeNull();
    expect(await asked(`${ORIGIN}/assets/index-v1.js`, "POST")).toBeNull();
    expect(
      await respond(deps, { url: `${ORIGIN}/api/x`, method: "GET", mode: "navigate" }),
    ).toBeNull();
  });

  it("answers a file of no verified release with an error, not from the network", async () => {
    const { deps } = await installedV1();
    const unknown = await asset(deps, "/assets/unknown.js");
    expect(unknown?.status).toBe(404);
    expect(await unknown?.text()).toBe("Not part of a verified release of Kennwort.");
  });

  it("answers a navigation with an error when the current version's page is gone", async () => {
    const { caches, deps } = await installedV1();
    for (const name of await caches.keys()) {
      if (name.startsWith("kennwort-release-")) await caches.delete(name);
    }
    expect((await navigate(deps))?.status).toBe(503);
  });

  it("serves another page of the build by its name, an unknown one as the app", async () => {
    const { server, deps } = setUp();
    server.serve(publish(new Map([...build("v1"), ["/other.html", "other page"]]), 1).published);
    await install(deps);
    expect(await page(deps, "/other.html")).toBe("other page");
    expect(await page(deps, "/missing.html")).toContain("<title>v1</title>");
  });

  it("answers nothing before a version is installed", async () => {
    const { deps } = setUp();
    expect(await navigate(deps)).toBeNull();
    expect(await asset(deps, "/assets/index-v1.js")).toBeNull();
  });
});

describe("security headers (P-16, CSP)", () => {
  const expectHeaders = (response: Response | null) => {
    for (const [name, value] of Object.entries(appHeaders({ secure: true, hsts: false }))) {
      expect([name, response?.headers.get(name)]).toEqual([name, value]);
    }
    expect(response?.headers.get("strict-transport-security")).toBeNull();
  };

  it("puts the app's policy on every page and file it serves from its caches", async () => {
    const { deps } = await installedV1();
    for (const path of ["/", "/entries/abc", "/s/Zm9vYmFy"]) {
      const answer = await navigate(deps, path);
      expectHeaders(answer);
      expect(await answer?.text()).toContain("<title>v1</title>");
    }
    const script = await asset(deps, "/assets/index-v1.js");
    expectHeaders(script);
    expect(script?.headers.get("content-type")).toBe("text/plain");
    expect(await script?.text()).toBe('console.log("v1")');
    expectHeaders(await asset(deps, "/assets/unknown.js"));
  });

  it("upgrades insecure requests only on an https origin", async () => {
    const { deps } = await installedV1();
    const local = { ...deps, origin: "http://localhost:5176" };
    const answer = await respond(local, {
      url: "http://localhost:5176/assets/index-v1.js",
      method: "GET",
      mode: "cors",
    });
    expect(answer?.headers.get("content-security-policy")).toBe(appPolicy({ secure: false }));
  });
});

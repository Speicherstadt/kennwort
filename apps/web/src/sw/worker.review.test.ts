import { describe, expect, it } from "vitest";
import { build, fakeServer, memoryCaches, ORIGIN, publish, RELEASE_KEYS } from "./test-doubles.ts";
import { activate, check, install, respond, type WorkerDeps } from "./worker.ts";

const setUp = (wrap?: (deps: WorkerDeps) => WorkerDeps) => {
  const server = fakeServer();
  const base: WorkerDeps = {
    fetch: server.fetch,
    caches: memoryCaches(),
    origin: ORIGIN,
    publicKey: RELEASE_KEYS.publicKey,
  };
  return { server, deps: wrap ? wrap(base) : base };
};
const navigate = (deps: WorkerDeps, path = "/") =>
  respond(deps, { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" });
/** What sw.ts does: the worker's answer, else the network */
const loaded = async (
  deps: WorkerDeps,
  fetch: WorkerDeps["fetch"],
  path: string,
  mode: RequestMode,
) => {
  const answer = await respond(deps, { url: `${ORIGIN}${path}`, method: "GET", mode });
  return (answer ?? (await fetch(`${ORIGIN}${path}`))).text();
};
const gate = () => {
  let open = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};

describe("review: no unverified code reaches a verified page", () => {
  it("serves a tab still open on an older release its lazy chunk only verified, never from the network", async () => {
    const { server, deps } = setUp();
    server.serve(publish(build("v1"), 1).published);
    expect((await install(deps)).ok).toBe(true);
    await activate(deps);
    expect(await navigate(deps)).not.toBeNull(); // tab A opens on v1 and stays open for days

    for (const [marker, sequence] of [
      ["v2", 2],
      ["v3", 3],
    ] as const) {
      server.serve(publish(build(marker), sequence).published);
      expect((await check(deps)).ready).toBe(true);
      await navigate(deps); // another tab opens: the ready version takes over
    }
    // tab A now loads its lazy chunk (e.g. the generator's word list); the server swaps it
    server.tamper("/assets/index-v1.js", "steal()");
    expect(await loaded(deps, server.fetch, "/assets/index-v1.js", "cors")).not.toBe("steal()");
  });

  it("keeps the files of the version a tab just navigated to when a check finishes after that navigation", async () => {
    const hold = gate();
    let holding = false;
    const { server, deps } = setUp((base) => ({
      ...base,
      fetch: async (url, init) => {
        if (holding && new URL(url).pathname === "/assets/index-v3.js") await hold.opened;
        return base.fetch(url, init);
      },
    }));
    server.serve(publish(build("v1"), 1).published);
    await install(deps);
    await activate(deps);
    server.serve(publish(build("v2"), 2).published);
    expect((await check(deps)).ready).toBe(true);

    server.serve(publish(build("v3"), 3).published);
    holding = true;
    const checking = check(deps); // the page asks for a check; the server is slow with v3
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await (await navigate(deps))?.text()).toContain("<title>v2</title>"); // tab B opens on v2
    hold.open();
    await checking;

    // tab B, on v2, loads its script: it must come from the verified v2 cache
    server.tamper("/assets/index-v2.js", "steal()");
    expect(await loaded(deps, server.fetch, "/assets/index-v2.js", "cors")).toBe(
      'console.log("v2")',
    );
  });

  it("never sends a navigation to the network while a version is held, even if a navigation ran during a check's store", async () => {
    let checkStored = false;
    let paused = false;
    const hold = gate();
    const { server, deps } = setUp((base) => ({
      ...base,
      caches: {
        ...base.caches,
        open: async (name: string) => {
          // the check has stored v3 and is about to save its state: a navigation happens now
          if (name === "kennwort-state" && checkStored && !paused) {
            paused = true;
            await hold.opened;
          }
          if (name.startsWith("kennwort-release-") && holdingV3(name)) checkStored = true;
          return base.caches.open(name);
        },
        has: (name: string) => base.caches.has(name),
        keys: () => base.caches.keys(),
        delete: (name: string) => base.caches.delete(name),
      } as unknown as CacheStorage,
    }));
    let v3 = "";
    const holdingV3 = (name: string) => v3 !== "" && name.endsWith(v3);

    server.serve(publish(build("v1"), 1).published);
    await install(deps);
    await activate(deps);
    server.serve(publish(build("v2"), 2).published);
    expect((await check(deps)).ready).toBe(true);

    const third = publish(build("v3"), 3);
    v3 = third.release.version;
    server.serve(third.published);
    const checking = check(deps);
    while (!paused) await new Promise((resolve) => setTimeout(resolve, 1));
    await navigate(deps); // promotes v2 and drops what it does not hold, v3's fresh cache too
    hold.open();
    expect((await checking).ready).toBe(true);

    server.tamper("/", "<script>steal()</script>"); // the server answers a navigation to /
    expect(await loaded(deps, server.fetch, "/", "navigate")).not.toContain("steal()");
  });

  it("does not install an older signed release than one already held (rollback at a worker update)", async () => {
    const { server, deps } = setUp();
    const old = publish(build("v1"), 1).published;
    server.serve(old);
    await install(deps);
    await activate(deps);
    server.serve(publish(build("v2"), 2).published);
    await check(deps);
    await navigate(deps); // v2 serves
    // the worker's code changes in a release, so the browser installs the new sw.js; the server
    // answers its install with the old, correctly signed v1
    server.serve(old);
    const reinstalled = await install(deps);
    await activate(deps);
    expect(reinstalled.ok && (await (await navigate(deps))?.text())?.includes("v1")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { toHex } from "./release.ts";
import { build, fakeServer, memoryCaches, ORIGIN, publish, RELEASE_KEYS } from "./test-doubles.ts";

/** Loads sw.ts into a fake worker scope and hands back its fetch listener */
const loadWorker = async () => {
  const server = fakeServer();
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal("KENNWORT_RELEASE_PUBLIC_KEY", toHex(RELEASE_KEYS.publicKey));
  vi.stubGlobal("location", new URL(`${ORIGIN}/sw.js`));
  vi.stubGlobal("caches", memoryCaches());
  vi.stubGlobal("fetch", (request: { url: string } | string) =>
    server.fetch(typeof request === "string" ? request : request.url),
  );
  vi.stubGlobal("skipWaiting", async () => {});
  vi.stubGlobal("clients", { claim: async () => {} });
  vi.stubGlobal("addEventListener", (type: string, listener: (event: unknown) => void) =>
    listeners.set(type, listener),
  );
  vi.resetModules();
  await import("./sw.ts");
  const run = async (type: string) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
  };
  server.serve(publish(build("v1"), 1).published);
  await run("install");
  await run("activate");
  return { server, fetchListener: listeners.get("fetch") };
};

describe("harness", () => {
  it("answers a GET navigation from the verified cache (control)", async () => {
    const { server, fetchListener } = await loadWorker();
    server.tamper("/vault", "<script>steal()</script>");
    let answered: Promise<Response> | null = null;
    fetchListener?.({
      request: { url: `${ORIGIN}/vault`, method: "GET", mode: "navigate" },
      respondWith: (response: Promise<Response>) => (answered = response),
    });
    expect(await (await (answered as unknown as Promise<Response>)).text()).toContain(
      "<title>v1</title>",
    );
    vi.unstubAllGlobals();
  });
});

describe("review: no server document runs at the app's origin while a version is held", () => {
  it("does not hand the server's HTML to a POST navigation (a cross-site form) unchecked", async () => {
    const { server, fetchListener } = await loadWorker();
    server.tamper("/vault", "<script>caches.open('kennwort-release-x')</script>");
    let answered: Promise<Response> | null = null;
    fetchListener?.({
      request: { url: `${ORIGIN}/vault`, method: "POST", mode: "navigate" },
      respondWith: (response: Promise<Response>) => (answered = response),
      waitUntil: () => {},
    });
    // Without respondWith the browser loads the server's document as it is
    expect(answered).not.toBeNull();
    const response = await (answered as unknown as Promise<Response>);
    expect(response.headers.get("content-type")).not.toContain("html");
    vi.unstubAllGlobals();
  });
});

/**
 * Test doubles for the service worker's surroundings: Cache Storage in memory and a server whose
 * files and signed releases a test can change, honestly or not.
 */
import { ed25519KeyPair, sign } from "@kennwort/crypto";
import { newRelease, RELEASE_PURPOSE, serializeRelease, toHex } from "./release.ts";

export const ORIGIN = "https://kennwort.test";
export const RELEASE_KEYS = ed25519KeyPair(new Uint8Array(32).fill(1));
export const OTHER_KEYS = ed25519KeyPair(new Uint8Array(32).fill(2));

const text = (value: string) => new TextEncoder().encode(value);

export const memoryCaches = (): CacheStorage => {
  const stores = new Map<string, Map<string, Response>>();
  const cacheOf = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      put: async (key: string, response: Response) => void store.set(key, response),
      match: async (key: string) => store.get(key)?.clone(),
    } as unknown as Cache;
  };
  return {
    open: async (name: string) => cacheOf(name),
    has: async (name: string) => stores.has(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  } as unknown as CacheStorage;
};

export type Build = Map<string, string>;

export const build = (marker: string): Build =>
  new Map([
    ["/index.html", `<!doctype html><title>${marker}</title>`],
    [`/assets/index-${marker}.js`, `console.log("${marker}")`],
  ]);

/** What a server publishes for a build: the files, release.json and release.sig */
export const publish = (files: Build, sequence: number, secretKey = RELEASE_KEYS.secretKey) => {
  const release = newRelease(
    new Map([...files].map(([path, body]) => [path, text(body)])),
    sequence,
  );
  const manifest = serializeRelease(release);
  const published = new Map<string, Uint8Array>(
    [...files].map(([path, body]) => [path, text(body)]),
  );
  published.set("/release.json", manifest);
  published.set("/release.sig", text(toHex(sign(secretKey, RELEASE_PURPOSE, manifest))));
  return { release, published };
};

/** A server answering from whatever it publishes at the moment; it records what was asked */
export const fakeServer = () => {
  let files = new Map<string, Uint8Array>();
  const asked: string[] = [];
  const fetch = async (url: string) => {
    const path = new URL(url).pathname;
    asked.push(path);
    const body = files.get(path);
    return body
      ? new Response(body.slice().buffer, { headers: { "content-type": "text/plain" } })
      : new Response("not found", { status: 404 });
  };
  return {
    fetch,
    asked,
    serve: (published: Map<string, Uint8Array>) => {
      files = new Map(published);
    },
    tamper: (path: string, body: string) => {
      files.set(path, text(body));
    },
    remove: (path: string) => {
      files.delete(path);
    },
  };
};

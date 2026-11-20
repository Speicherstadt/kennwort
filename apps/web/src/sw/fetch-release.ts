/**
 * Fetches a release from the server and checks it (P-16): first release.json and release.sig
 * against the release key, then every listed file against its hash. Nothing the server sends is
 * trusted before both checks hold; every request bypasses the HTTP cache, so what is checked is
 * what the server delivers now.
 */
import type { VerifiedFile } from "./cache-store.ts";
import {
  checkFiles,
  type FileError,
  openRelease,
  type Release,
  type ReleaseError,
} from "./release.ts";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type FetchError = "network" | ReleaseError | FileError;
export type Fetched<T> = { ok: true; value: T } | { ok: false; error: FetchError; path?: string };

const fresh: RequestInit = { cache: "no-store", credentials: "same-origin" };

const bytesOf = async (fetch: Fetch, url: string): Promise<VerifiedFile | null> => {
  try {
    const response = await fetch(url, fresh);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "application/octet-stream";
    return { bytes: new Uint8Array(await response.arrayBuffer()), type };
  } catch {
    return null;
  }
};

/** The signed manifest the server offers now, if its signature holds */
export const fetchRelease = async (
  fetch: Fetch,
  origin: string,
  publicKey: Uint8Array,
): Promise<Fetched<Release>> => {
  const [manifest, signature] = await Promise.all([
    bytesOf(fetch, new URL("/release.json", origin).href),
    bytesOf(fetch, new URL("/release.sig", origin).href),
  ]);
  if (!manifest || !signature) return { ok: false, error: "network" };
  const opened = openRelease(publicKey, manifest.bytes, new TextDecoder().decode(signature.bytes));
  return opened.ok ? opened : { ok: false, error: opened.error };
};

/** Every file of the release, each matching its hash; a missing one counts as missing */
export const fetchFiles = async (
  fetch: Fetch,
  origin: string,
  release: Release,
): Promise<Fetched<Map<string, VerifiedFile>>> => {
  const paths = Object.keys(release.files);
  const fetched = await Promise.all(
    paths.map((path) => bytesOf(fetch, new URL(path, origin).href)),
  );
  const files = new Map<string, VerifiedFile>();
  paths.forEach((path, index) => {
    const file = fetched[index];
    if (file) files.set(path, file);
  });
  const checked = checkFiles(
    release,
    new Map([...files].map(([path, file]) => [path, file.bytes])),
  );
  return checked.ok ? { ok: true, value: files } : checked;
};

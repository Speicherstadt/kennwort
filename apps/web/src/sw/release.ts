/**
 * The release manifest of P-16 (docs/sicherheitsdesign.md): every file of a web app build with its
 * SHA-256, signed with the release key (F-03, purpose "release") over the exact bytes of
 * release.json. The build writes it (apps/web/scripts/sign-release.ts), the service worker checks it
 * before it serves a single file of a version.
 */
import { type Result, sha256, verify } from "@kennwort/crypto";

export const RELEASE_FORMAT = 1;
export const RELEASE_PURPOSE = "release";
/** The files of a build that are not part of its manifest: the manifest itself and the worker */
export const UNLISTED = ["/release.json", "/release.sig", "/sw.js"];

/**
 * version: a content address of the files, so the same build always has the same name;
 * sequence: grows with every release (SOURCE_DATE_EPOCH), so an old signed release never comes back
 */
export type Release = {
  format: typeof RELEASE_FORMAT;
  version: string;
  sequence: number;
  files: Record<string, string>;
};

export type ReleaseError = "signature" | "malformed";
export type FileError = "hash" | "missing" | "extra";
export type FilesCheck = { ok: true } | { ok: false; error: FileError; path: string };

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Lower-case hex only, so one value has exactly one spelling */
export const fromHex = (text: string): Uint8Array | null =>
  /^(?:[0-9a-f]{2})*$/.test(text)
    ? Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
    : null;

const utf8 = new TextEncoder();
const sortedFiles = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** A new release of these files; the paths start with "/" as the browser asks for them */
export const newRelease = (files: Map<string, Uint8Array>, sequence: number): Release => {
  const hashes = sortedFiles(
    Object.fromEntries([...files].map(([path, bytes]) => [path, toHex(sha256(bytes))])),
  );
  const listing = Object.entries(hashes).map(([path, hash]) => `${hash}  ${path}\n`);
  return {
    format: RELEASE_FORMAT,
    version: toHex(sha256(utf8.encode(listing.join("")))).slice(0, 16),
    sequence,
    files: hashes,
  };
};

/** release.json as the build writes and signs it, readable for anyone who checks a release */
export const serializeRelease = (release: Release): Uint8Array =>
  utf8.encode(`${JSON.stringify({ ...release, files: sortedFiles(release.files) }, null, 2)}\n`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validFiles = (files: unknown): files is Record<string, string> =>
  isRecord(files) &&
  Object.entries(files).every(
    ([path, hash]) =>
      path.startsWith("/") &&
      !UNLISTED.includes(path) &&
      typeof hash === "string" &&
      /^[0-9a-f]{64}$/.test(hash),
  );

const parse = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
};

export const parseRelease = (bytes: Uint8Array): Result<Release, "malformed"> => {
  const value = parse(bytes);
  if (
    !isRecord(value) ||
    value.format !== RELEASE_FORMAT ||
    typeof value.version !== "string" ||
    !/^[0-9a-f]{16}$/.test(value.version) ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0 ||
    !validFiles(value.files)
  ) {
    return { ok: false, error: "malformed" };
  }
  const { format, version, sequence, files } = value as Release;
  return { ok: true, value: { format, version, sequence, files } };
};

/** The release only when the signature by this key over exactly these bytes holds */
export const openRelease = (
  publicKey: Uint8Array,
  manifest: Uint8Array,
  signatureHex: string,
): Result<Release, ReleaseError> => {
  const signature = fromHex(signatureHex.trim());
  if (!signature || !verify(publicKey, signature, RELEASE_PURPOSE, manifest)) {
    return { ok: false, error: "signature" };
  }
  return parseRelease(manifest);
};

/** The files match the manifest exactly: each listed one present with its hash, none besides */
export const checkFiles = (release: Release, files: Map<string, Uint8Array>): FilesCheck => {
  for (const [path, hash] of Object.entries(release.files)) {
    const bytes = files.get(path);
    if (!bytes) return { ok: false, error: "missing", path };
    if (toHex(sha256(bytes)) !== hash) return { ok: false, error: "hash", path };
  }
  const extra = [...files.keys()].find((path) => !Object.hasOwn(release.files, path));
  return extra === undefined ? { ok: true } : { ok: false, error: "extra", path: extra };
};

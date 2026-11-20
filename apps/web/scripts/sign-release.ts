/**
 * Signs a build (P-16): hashes every file of <dist> into release.json and signs its exact bytes with
 * the release key (F-03, purpose "release") into release.sig. Without KENNWORT_RELEASE_KEY it signs
 * with the agent loop's test key and says so.
 *
 *   bun scripts/sign-release.ts dist
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { sign } from "@kennwort/crypto";
import { newRelease, RELEASE_PURPOSE, serializeRelease, toHex } from "../src/sw/release.ts";
import { listedPaths, sequenceOf, signingKeys } from "./release-build.ts";

const dist = process.argv[2] ?? "dist";
const keys = signingKeys(process.env);
if (!keys.ok) {
  console.error(keys.error);
  process.exit(1);
}

const relatives = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, join(entry.parentPath, entry.name)));
const files = new Map(
  listedPaths(relatives).map((path) => [path, new Uint8Array(readFileSync(join(dist, path)))]),
);
const release = newRelease(files, sequenceOf(process.env, Date.now()));
const manifest = serializeRelease(release);
writeFileSync(join(dist, "release.json"), manifest);
writeFileSync(
  join(dist, "release.sig"),
  `${toHex(sign(keys.value.secretKey, RELEASE_PURPOSE, manifest))}\n`,
);
const by = keys.value.isTestKey ? "the loop's TEST key, not for publication" : "the release key";
console.log(`release ${release.version} (${files.size} files) signed with ${by}`);

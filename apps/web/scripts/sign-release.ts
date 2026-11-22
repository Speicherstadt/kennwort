/**
 * Signs a build (P-16): hashes every file of <dist> into release.json and signs its exact bytes with
 * the release key (F-03, purpose "release") into release.sig. Without KENNWORT_RELEASE_KEY it signs
 * with the agent loop's test key and says so. The sequence is SOURCE_DATE_EPOCH, else the time of
 * the last commit, so the same commit always gives the same release.json and release.sig (K-408).
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

/** `git log -1 --format=%ct`, or undefined outside a checkout or without git */
const lastCommitTime = (): string | undefined => {
  try {
    const git = Bun.spawnSync(["git", "log", "-1", "--format=%ct"], { stderr: "ignore" });
    return git.exitCode === 0 ? git.stdout.toString() : undefined;
  } catch {
    return undefined;
  }
};

const relatives = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, join(entry.parentPath, entry.name)));
const files = new Map(
  listedPaths(relatives).map((path) => [path, new Uint8Array(readFileSync(join(dist, path)))]),
);
const { sequence, source } = sequenceOf(process.env, {
  commit: lastCommitTime(),
  nowMs: Date.now(),
});
const release = newRelease(files, sequence);
const manifest = serializeRelease(release);
writeFileSync(join(dist, "release.json"), manifest);
writeFileSync(
  join(dist, "release.sig"),
  `${toHex(sign(keys.value.secretKey, RELEASE_PURPOSE, manifest))}\n`,
);
const by = keys.value.isTestKey ? "the loop's TEST key, not for publication" : "the release key";
console.log(
  `release ${release.version} (${files.size} files, sequence ${sequence} from ${source}) signed with ${by}`,
);

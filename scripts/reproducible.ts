/**
 * `bun run reproducible` (K-408): builds the same commit twice and fails, with a list of the files
 * that differ, unless both builds are the same byte for byte. The second build runs in another time
 * zone and locale, so a build that depends on either fails here too. With --reuse the build already
 * there counts as the first (CI, right after `bun run build` on a fresh checkout); with --release it
 * also compares the web app with a published release.json (P-16), so anyone can check that a
 * release was built from this commit.
 *
 *   bun run reproducible [--reuse] [--release <published release.json>]
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  BUILD_OUTPUTS,
  type BuiltFile,
  describeDifferences,
  differences,
  missingOutputs,
  parseArgs,
  releaseDifferences,
  type Snapshot,
} from "./reproducible-compare.ts";

const root = join(import.meta.dirname, "..");
const MAX_TEXT = 1024 * 1024;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const filesUnder = (path: string): string[] =>
  statSync(path).isFile()
    ? [path]
    : readdirSync(path, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));

/** A file's hash, and its text when it is small and has no NUL byte, to show a differing line */
const builtFile = (path: string): BuiltFile => {
  const bytes = readFileSync(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const isText = bytes.length <= MAX_TEXT && !bytes.includes(0);
  return isText ? { hash, text: bytes.toString("utf8") } : { hash };
};

const snapshotOf = (outputs: readonly string[]): Snapshot => {
  const missing = missingOutputs(outputs, (output) => existsSync(join(root, output)));
  if (missing.length > 0) fail(`The build produced no ${missing.join(", ")} (BUILD_OUTPUTS)`);
  const paths = outputs.flatMap((output) => filesUnder(join(root, output))).sort();
  return new Map(paths.map((path) => [relative(root, path).split(sep).join("/"), builtFile(path)]));
};

const clean = () => {
  for (const output of BUILD_OUTPUTS) rmSync(join(root, output), { recursive: true, force: true });
};

/** `bun run build` from a clean state; returns how long it took in seconds */
const build = (label: string, env: Record<string, string | undefined>): number => {
  clean();
  console.log(`\n== ${label}`);
  const started = performance.now();
  const { exitCode } = Bun.spawnSync(["bun", "run", "build"], {
    cwd: root,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (exitCode !== 0) fail(`${label} failed`);
  return (performance.now() - started) / 1000;
};

/** The second build in another time zone and locale than the first */
const elsewhere = { ...process.env, TZ: "Pacific/Kiritimati", LANG: "de_DE.UTF-8", LC_ALL: "C" };

const compareWithRelease = (path: string) => {
  const parse = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown;
  const found = releaseDifferences(parse(path), parse(join(root, "apps/web/dist/release.json")));
  if (!found.ok) fail(`${path}: ${found.error}`);
  else if (found.value.length > 0)
    fail(describeDifferences(found.value, [`the published ${path}`, "this build"]));
  else console.log(`The web app matches ${path}: same version, same hash for every file.`);
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.ok) return fail(options.error);
  const firstTook = options.value.reuse ? undefined : build("first build", process.env);
  const first = snapshotOf(BUILD_OUTPUTS);
  const secondTook = build("second build (TZ=Pacific/Kiritimati, LC_ALL=C)", elsewhere);
  const second = snapshotOf(BUILD_OUTPUTS);
  const took = [firstTook, secondTook]
    .filter((seconds) => seconds !== undefined)
    .map((seconds) => `${seconds.toFixed(1)} s`)
    .join(" + ");
  const found = differences(first, second);
  if (found.length > 0) fail(`\n${describeDifferences(found)}\nNot reproducible (K-408).`);
  console.log(
    `\nReproducible: ${first.size} files in ${BUILD_OUTPUTS.join(", ")} (build ${took}).`,
  );
  if (options.value.release) compareWithRelease(options.value.release);
};

main();

/**
 * Pure parts of `bun run reproducible` (K-408): what a build produces, how two builds differ and how
 * a build differs from a published release.json. scripts/reproducible.ts does the building and the
 * reading.
 */

/**
 * Everything `bun run build` produces (scripts/build-all.ts): the web app with its signed release
 * manifest, the extension for each browser and the compiled server. A workspace that starts to build
 * something else adds its output here; a listed output that a build does not produce fails the run.
 */
export const BUILD_OUTPUTS = [
  "apps/web/dist",
  "apps/extension/dist/chrome",
  "apps/extension/dist/firefox",
  "apps/extension/dist/safari",
  "apps/server/dist",
] as const;

/** One file of a build: its SHA-256 and, for a small text file, its text to show where it differs */
export type BuiltFile = { hash: string; text?: string };
/** A build's files by path from the repository's root, with "/" between folders */
export type Snapshot = Map<string, BuiltFile>;

export type Difference =
  | { kind: "changed"; path: string; line?: { number: number; first: string; second: string } }
  | { kind: "only-first" | "only-second"; path: string };

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The first line two texts differ in, numbered from 1 */
export const firstDifferentLine = (first: string, second: string) => {
  const one = first.split("\n");
  const other = second.split("\n");
  const index = one.findIndex((line, i) => line !== other[i]);
  const at = index === -1 ? one.length : index;
  return { number: at + 1, first: one[at] ?? "", second: other[at] ?? "" };
};

const changed = (path: string, first: BuiltFile, second: BuiltFile): Difference =>
  first.text !== undefined && second.text !== undefined
    ? { kind: "changed", path, line: firstDifferentLine(first.text, second.text) }
    : { kind: "changed", path };

/** Every file that is not the same in both builds, sorted by path */
export const differences = (first: Snapshot, second: Snapshot): Difference[] => {
  const paths = [...new Set([...first.keys(), ...second.keys()])].sort(byPath);
  return paths.flatMap((path): Difference[] => {
    const one = first.get(path);
    const other = second.get(path);
    if (!other) return [{ kind: "only-first", path }];
    if (!one) return [{ kind: "only-second", path }];
    return one.hash === other.hash ? [] : [changed(path, one, other)];
  });
};

const MAX_EXCERPT = 160;
const excerpt = (line: string) =>
  line.length > MAX_EXCERPT ? `${line.slice(0, MAX_EXCERPT)}…` : line;

const describeOne = (difference: Difference, labels: [string, string]): string[] => {
  if (difference.kind !== "changed") {
    const where = difference.kind === "only-first" ? labels[0] : labels[1];
    return [`  ${difference.path}: only in ${where}`];
  }
  if (!difference.line) return [`  ${difference.path}: different bytes`];
  const { number, first, second } = difference.line;
  return [
    `  ${difference.path}: differs from line ${number}`,
    `    ${labels[0]}: ${excerpt(first)}`,
    `    ${labels[1]}: ${excerpt(second)}`,
  ];
};

/** The differences as a report a person can read, one file after the other */
export const describeDifferences = (
  found: Difference[],
  labels: [string, string] = ["the first build", "the second build"],
): string =>
  [
    `${found.length} file(s) differ between ${labels[0]} and ${labels[1]}:`,
    ...found.flatMap((difference) => describeOne(difference, labels)),
  ].join("\n");

/** The listed outputs a build left missing */
export const missingOutputs = (outputs: readonly string[], exists: (path: string) => boolean) =>
  outputs.filter((output) => !exists(output));

type ReleaseFiles = { version: string; files: Record<string, string> };

const isReleaseFiles = (value: unknown): value is ReleaseFiles => {
  const release = value as Partial<ReleaseFiles> | null;
  return (
    typeof release?.version === "string" &&
    typeof release.files === "object" &&
    release.files !== null &&
    Object.values(release.files).every((hash) => typeof hash === "string")
  );
};

const asSnapshot = (files: Record<string, string>): Snapshot =>
  new Map(Object.entries(files).map(([path, hash]) => [path, { hash }]));

/**
 * How the web app just built differs from a published release.json: its file list and version.
 * The sequence and the signature are left out: a published release is signed with the release key,
 * a rebuild with the loop's test key.
 */
export const releaseDifferences = (
  published: unknown,
  built: unknown,
): { ok: true; value: Difference[] } | { ok: false; error: string } => {
  if (!isReleaseFiles(published)) return { ok: false, error: "not a release.json (P-16)" };
  if (!isReleaseFiles(built)) return { ok: false, error: "the build wrote no valid release.json" };
  const files = differences(asSnapshot(published.files), asSnapshot(built.files));
  const version: Difference[] =
    published.version === built.version
      ? []
      : [
          {
            kind: "changed",
            path: "version",
            line: { number: 1, first: published.version, second: built.version },
          },
        ];
  return { ok: true, value: [...version, ...files] };
};

export type Options = { reuse: boolean; release?: string };

const USAGE = "usage: bun run reproducible [--reuse] [--release <published release.json>]";

/** The command line: --reuse takes the build already there (a clean one, as in CI) as the first */
export const parseArgs = (
  args: string[],
): { ok: true; value: Options } | { ok: false; error: string } => {
  const options: Options = { reuse: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const file = args[i + 1];
    if (arg === "--reuse") options.reuse = true;
    else if (arg === "--release" && file) {
      options.release = file;
      i++;
    } else return { ok: false, error: `${arg}: unknown or incomplete\n${USAGE}` };
  }
  return { ok: true, value: options };
};

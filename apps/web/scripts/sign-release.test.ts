// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRelease } from "../src/sw/release.ts";
import { EMPTY_STATE, installed, isNewer } from "../src/sw/state.ts";

const script = join(import.meta.dirname, "sign-release.ts");
const printSequence = join(import.meta.dirname, "print-sequence.ts");

/**
 * sign-release.ts in a repository of its own, so the commits and their committer times are the
 * test's: the order of releases must hold even where committer time does not grow (a commit from a
 * machine with a clock behind, a fast-forward of a commit made earlier, two commits in one second)
 */
describe("sign-release.ts: the sequence along the history (K-408, P-16 rollback protection)", () => {
  let repo: string;
  const env = (committed?: number) => {
    const { SOURCE_DATE_EPOCH: _, ...rest } = process.env;
    const date = committed === undefined ? {} : { GIT_COMMITTER_DATE: `${committed} +0000` };
    return { ...rest, GIT_AUTHOR_DATE: "1700000000 +0000", ...date };
  };
  const git = (args: string[], committed?: number) => {
    const run = spawnSync("git", args, { cwd: repo, env: env(committed), encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr);
  };
  /** A commit with this committer time, then the release signed on it */
  const releaseAt = (content: string, committed: number) => {
    writeFileSync(join(repo, "dist", "index.html"), content);
    git(["add", "-A"]);
    git(["commit", "-qm", content], committed);
    const run = spawnSync("bun", [script, "dist"], { cwd: repo, env: env(), encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr);
    const release = parseRelease(readFileSync(join(repo, "dist", "release.json")));
    if (!release.ok) throw new Error(release.error);
    return release.value;
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "kennwort-sign-"));
    mkdirSync(join(repo, "dist"));
    git(["init", "-q"]);
    git(["config", "user.name", "Jonas Weber"]);
    git(["config", "user.email", "jonas@weber-haustechnik.example"]);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("gives a later commit a higher sequence even when its committer time went backwards", () => {
    const older = releaseAt("<p>1</p>", 2_000_000_000);
    const newer = releaseAt("<p>2</p>", 1_999_999_000);
    expect(newer.sequence).toBeGreaterThan(older.sequence);
    // A worker installed fresh on the newer release must refuse the older one as an update
    expect(isNewer(installed(EMPTY_STATE, newer), older)).toBe(false);
  });

  it("gives a later commit in the same second a higher sequence, so the update is taken", () => {
    const older = releaseAt("<p>1</p>", 2_000_000_000);
    const newer = releaseAt("<p>2</p>", 2_000_000_000);
    expect(isNewer(installed(EMPTY_STATE, older), newer)).toBe(true);
  });

  it("signs the same sequence for two builds of the same commit", () => {
    const first = releaseAt("<p>1</p>", 2_000_000_000);
    const again = spawnSync("bun", [script, "dist"], { cwd: repo, env: env(), encoding: "utf8" });
    expect(again.status).toBe(0);
    const second = parseRelease(readFileSync(join(repo, "dist", "release.json")));
    expect(second.ok && second.value.sequence).toBe(first.sequence);
  });

  it("prints the sequence it signs, for the release workflow's image build (K-703)", () => {
    const signed = releaseAt("<p>1</p>", 2_000_000_000);
    releaseAt("<p>2</p>", 1_999_999_000);
    const printed = spawnSync("bun", [printSequence], { cwd: repo, env: env(), encoding: "utf8" });
    expect(printed.status).toBe(0);
    expect(Number(printed.stdout.trim())).toBe(signed.sequence + 1);
  });

  it("prints nothing outside a checkout, where the number would come from the clock", () => {
    rmSync(join(repo, ".git"), { recursive: true, force: true });
    const printed = spawnSync("bun", [printSequence], { cwd: repo, env: env(), encoding: "utf8" });
    expect(printed.status).toBe(1);
    expect(printed.stdout).toBe("");
  });
});

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The step `filter` of the job `changes` in .github/workflows/ci.yml, run as it is against a small
// repository whose last commit changes the given files
const workflow = readFileSync(join(import.meta.dirname, "..", ".github/workflows/ci.yml"), "utf8");
const filterStep = (): string => {
  const match = workflow.match(/- id: filter\n {8}run: \|\n((?: {10}.*\n|\n)+)/);
  if (!match?.[1]) throw new Error("ci.yml has no step `filter`");
  return match[1].replace(/^ {10}/gm, "");
};

const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-c", "user.name=ci", "-c", "user.email=ci@example.org", ...args], { cwd });

const write = (root: string, file: string, text: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

const outputsFor = (changed: string[]): Record<string, string> => {
  const root = mkdtempSync(join(tmpdir(), "ci-changes-"));
  git(root, "init", "-q");
  for (const file of changed) write(root, file, "before\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  for (const file of changed) write(root, file, "after\n");
  git(root, "commit", "-qam", "change");
  const output = join(root, "github-output");
  const run = spawnSync("bash", ["-c", filterStep()], {
    cwd: root,
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return Object.fromEntries(
    readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("=") as [string, string]),
  );
};

describe("the job changes of ci.yml", () => {
  it("skips the checks for text only", () => {
    expect(outputsFor(["README.md", "docs/index.md", "LICENSE"]).code).toBe("false");
  });

  it("runs the checks for code", () => {
    expect(outputsFor(["docs/index.md", "apps/web/src/main.tsx"]).code).toBe("true");
  });

  // scripts/security-design.test.ts reads these two pages: a change to them alone can fail it
  it.each(["docs/plan.md", "docs/sicherheitsdesign.md"])("runs the checks for %s", (page) => {
    expect(outputsFor([page]).code).toBe("true");
  });
});

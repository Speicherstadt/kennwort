/** `bun run lint`: fails on a source file past 400 lines, with the globs of checks.json */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { MAX_LINES, oversized } from "./file-size.ts";

const root = process.cwd();
const { fileSize } = JSON.parse(readFileSync(join(root, "checks.json"), "utf8")) as {
  fileSize: { include: string[] };
};
const paths = new Set(
  fileSize.include.flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root })]),
);
const files = [...paths]
  .filter((path) => !path.includes("node_modules") && !path.includes("/paraglide/"))
  .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
const problems = oversized(files);
for (const { path, lines } of problems)
  console.error(
    `${path}  ${lines} lines, more than ${MAX_LINES}: put the new part into a file of its own`,
  );
process.exit(problems.length > 0 ? 1 : 0);

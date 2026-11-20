/**
 * `bun run lint`: fails on a Solid 1.x pattern in the Solid code (scripts/solid2-rules.ts,
 * docs/solid-2.0/MIGRATION.md). Tests are checked too: they show how the code is meant to be used.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { solid2Findings } from "./solid2-rules.ts";

const SOLID_CODE = ["apps/web/src", "apps/extension/src", "apps/mobile/src", "packages/ui/src"];
const SKIP = new Set(["node_modules", "paraglide", "dist"]);

const files = (dir: string): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (SKIP.has(name)) return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
};

const problems = SOLID_CODE.flatMap(files).flatMap((path) =>
  solid2Findings(readFileSync(path, "utf8")).map((f) => `${path}:${f.line}  ${f.rule}`),
);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} Solid 1.x pattern(s); see docs/solid-2.0/MIGRATION.md`);
  process.exit(1);
}

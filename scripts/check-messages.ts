/** `bun run lint`: fails on a message no code uses or one that only one language has */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { missingKeys, unusedMessages } from "./messages.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const de = JSON.parse(read("messages/de.json")) as Record<string, unknown>;
const en = JSON.parse(read("messages/en.json")) as Record<string, unknown>;
const sources = [
  "apps/*/src/**/*.{ts,tsx}",
  "packages/*/src/**/*.{ts,tsx}",
  "apps/*/scripts/**/*.ts",
]
  .flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root })])
  .filter((path) => !path.includes("node_modules") && !path.includes("/paraglide/"));
const code = [...new Set(sources)].map(read).join("\n");
const problems = [
  ...unusedMessages(Object.keys(de), code).map((key) => `${key}: not used in the code`),
  ...missingKeys(de, en).map((key) => `${key}: in only one of messages/de.json and en.json`),
];
for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);

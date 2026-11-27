// The Solid 2.0 skills in .agents/skills are copies of the ones the solid-js package ships
// (docs/entwicklung.md, "Solid 2.0"): when an update of solid-js changes them, this fails until they are
// copied again, so agents never read a guide for another version
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const solid = dirname(
  createRequire(join(process.cwd(), "apps/web/package.json")).resolve("solid-js/package.json"),
);

describe("Solid 2.0 skills", () => {
  it.each(["solid-2.0", "solid-2.0-cheatsheet", "reactivity-diagnostics"])(
    "%s matches solid-js",
    (skill) => {
      const ours = readFileSync(join(process.cwd(), ".agents/skills", skill, "SKILL.md"), "utf8");
      expect(ours).toBe(readFileSync(join(solid, "skills", skill, "SKILL.md"), "utf8"));
    },
  );
});

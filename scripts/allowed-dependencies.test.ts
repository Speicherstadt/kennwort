import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Allowlist, violations } from "./allowed-dependencies.ts";

const allowlist: Allowlist = {
  packages: {
    "solid-js": { reason: "UI", workspaces: ["packages/ui"] },
    "@noble/ciphers": { reason: "AEAD", workspaces: ["packages/crypto"] },
    tldts: { reason: "", workspaces: ["apps/extension"] },
  },
};

describe("violations", () => {
  it("lets a listed package through in a listed workspace", () => {
    expect(
      violations(allowlist, [{ dir: "packages/ui", dependencies: { "solid-js": "2.0.3" } }]),
    ).toEqual([]);
  });

  it("fails a package that is not on the list", () => {
    expect(
      violations(allowlist, [{ dir: "packages/ui", dependencies: { "left-pad": "1.3.0" } }]),
    ).toEqual(["packages/ui: left-pad is not in allowed-dependencies.json"]);
  });

  it("fails a listed package in a workspace not named for it", () => {
    expect(
      violations(allowlist, [{ dir: "apps/web", dependencies: { "solid-js": "2.0.3" } }]),
    ).toEqual(["apps/web: solid-js is allowed only in packages/ui"]);
  });

  it("fails an entry without a reason", () => {
    expect(
      violations(allowlist, [{ dir: "apps/extension", dependencies: { tldts: "7.5.5" } }]),
    ).toEqual(["apps/extension: tldts has no reason in allowed-dependencies.json"]);
  });

  it("takes nothing but @noble/* in packages/crypto, even when listed", () => {
    const listed: Allowlist = {
      packages: {
        ...allowlist.packages,
        zod: { reason: "schemas", workspaces: ["packages/crypto"] },
      },
    };
    expect(
      violations(listed, [{ dir: "packages/crypto", dependencies: { zod: "4.6.7" } }]),
    ).toEqual([
      "packages/crypto: zod is not @noble/*, the only packages allowed in packages/crypto",
    ]);
    expect(
      violations(listed, [{ dir: "packages/crypto", dependencies: { "@noble/ciphers": "2.4.0" } }]),
    ).toEqual([]);
  });

  it.each([
    "npm:left-pad@1.3.0",
    "^2.0.3",
    "github:solidjs/solid",
    "file:../solid",
    "https://x.test/a.tgz",
  ])("fails a listed name whose version %s is not an exact registry version", (version) => {
    expect(
      violations(allowlist, [{ dir: "packages/ui", dependencies: { "solid-js": version } }]),
    ).toEqual([`packages/ui: solid-js@${version} is not an exact registry version`]);
  });

  it("fails a non-noble package aliased as @noble/* in packages/crypto", () => {
    expect(
      violations(allowlist, [
        { dir: "packages/crypto", dependencies: { "@noble/ciphers": "npm:evil@1.0.0" } },
      ]),
    ).not.toEqual([]);
  });

  it("needs no entry for a workspace package", () => {
    expect(
      violations(allowlist, [{ dir: "apps/web", dependencies: { "@kennwort/ui": "workspace:*" } }]),
    ).toEqual([]);
  });
});

describe("bun run lint", () => {
  const root = join(import.meta.dirname, "..");
  const check = join(root, "scripts/check-dependencies.ts");
  const run = (cwd: string) => spawnSync("bun", [check], { cwd, encoding: "utf8" });

  it("passes on the repository as it is", () => {
    expect(run(root).status).toBe(0);
  });

  const lintIn = (manifest: object) => {
    const repo = mkdtempSync(join(tmpdir(), "kennwort-deps-"));
    cpSync(join(root, "allowed-dependencies.json"), join(repo, "allowed-dependencies.json"));
    mkdirSync(join(repo, "apps/web"), { recursive: true });
    writeFileSync(
      join(repo, "apps/web/package.json"),
      JSON.stringify({ name: "@kennwort/web", ...manifest }),
    );
    return run(repo);
  };

  it.each(["dependencies", "optionalDependencies", "peerDependencies"])(
    "fails when a client workspace takes a package that is not on the list in %s",
    (field) => {
      const result = lintIn({ [field]: { "left-pad": "1.3.0" } });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("apps/web: left-pad is not in allowed-dependencies.json");
    },
  );

  it("is part of the lint script", () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
    expect(scripts.lint).toContain("bun scripts/check-dependencies.ts");
  });
});

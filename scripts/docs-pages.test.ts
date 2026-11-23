import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The plan (docs/plan.md, "Dokumentation, Screenshots und Demo") lists the pages the website must
// have; each name maps to its file, and that file must exist and be in the mkdocs nav.
const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const pageFiles: Record<string, string> = {
  Überblick: "index.md",
  Installation: "installation.md",
  Sicherheitsdesign: "sicherheitsdesign.md",
  "Import und Export": "import-export.md",
  Extension: "extension.md",
  "Handy und App": "handy.md",
  Verwaltung: "verwaltung.md",
  FAQ: "faq.md",
  Datenschutz: "datenschutz.md",
};

const planPages = (plan: string): string[] => {
  const match = /Seiten:\s*([^.]+)\./.exec(plan.slice(plan.indexOf("- **Doku**")));
  if (!match?.[1]) throw new Error("plan lists no doc pages");
  return match[1].split(",").map((name) => name.replace(/\s+/g, " ").trim());
};

const navFiles = (mkdocs: string): string[] =>
  [...mkdocs.slice(mkdocs.indexOf("\nnav:")).matchAll(/:\s*([\w-]+\.md)\s*$/gm)].map(
    (match) => match[1] ?? "",
  );

describe("doc pages from the plan", () => {
  const pages = planPages(read("docs/plan.md"));
  const nav = navFiles(read("mkdocs.yml"));

  it("reads the plan's page list", () => {
    expect(pages).toContain("Handy und App");
  });

  it.each(pages)("“%s” has a file in docs/ and in the nav", (name) => {
    const file = pageFiles[name];
    expect(file, `no file mapped for “${name}”`).toBeDefined();
    expect(existsSync(join(root, "docs", file ?? ""))).toBe(true);
    expect(nav).toContain(file);
  });
});

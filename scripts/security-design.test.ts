import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { protocols, ruleNames, section, tableColumn } from "./security-design.ts";

const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");
const plan = read("docs/plan.md");
const design = read("docs/sicherheitsdesign.md");

const catalog = tableColumn(section(design, "### Angriffskatalog nach der ETH-Studie"));
const coverage = tableColumn(section(design, "### Abdeckung des Projektplans"));
const coverageAttacks = tableColumn(section(design, "### Abdeckung des Projektplans"), 2);
const threats = tableColumn(section(plan, "## Bedrohungsmodell"));
const cryptography = section(plan, "## Kryptografie");
const purposes = tableColumn(cryptography);
const rules = ruleNames(cryptography.slice(cryptography.indexOf("Regeln:")));
const designProtocols = protocols(design);

describe("security design", () => {
  it("reads the plan's threats and crypto rules", () => {
    expect(threats).toContain("Datenbank gestohlen");
    expect(rules).toEqual(expect.arrayContaining(["AAD", "Austritt", "Login per Passkey/SSO"]));
    expect(purposes).toContain("Symmetrisch");
  });

  it.each([...threats, ...rules, ...purposes])("covers the plan's “%s”", (item) => {
    expect(coverage).toContain(item);
  });

  it("has 27 attacks in its catalog, numbered E-01 to E-27", () => {
    expect(catalog).toEqual(
      Array.from({ length: 27 }, (_, index) => `E-${String(index + 1).padStart(2, "0")}`),
    );
  });

  it.each(designProtocols.map((protocol) => [protocol.id, protocol]))(
    "%s names the attacks it stops, all from the catalog",
    (_id, protocol) => {
      expect(protocol.stops.length).toBeGreaterThan(0);
      for (const attack of protocol.stops) expect(catalog).toContain(attack);
    },
  );

  it.each(catalog)("stops %s in at least one protocol", (attack) => {
    expect(designProtocols.some((protocol) => protocol.stops.includes(attack))).toBe(true);
  });

  it("names only catalog attacks in the coverage table", () => {
    const named = coverageAttacks.flatMap((cell) => cell.match(/E-\d+/g) ?? []);
    for (const attack of named) expect(catalog).toContain(attack);
  });
});

describe("section", () => {
  it("ends at the next heading of the same level, not at a deeper one", () => {
    expect(section("## A\nx\n### B\ny\n## C\nz", "## A")).toEqual(["x", "### B", "y"]);
  });
});

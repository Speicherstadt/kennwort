import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "../db/database.ts";
import { accounts, companies } from "../db/schema.ts";
import { companyScope } from "./scope.ts";

describe("companyScope", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  db.insert(companies)
    .values([
      { id: "weber", createdAt: 1 },
      { id: "mueller", createdAt: 2 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: "anna", companyId: "weber", createdAt: 1 },
      { id: "max", companyId: "mueller", createdAt: 2 },
    ])
    .run();

  it("reads only rows of its own company", () => {
    const weber = companyScope(db, "weber");
    expect(weber.company()?.id).toBe("weber");
    expect(weber.accounts().map((a) => a.id)).toEqual(["anna"]);
    expect(weber.account("max")).toBeUndefined();
    expect(weber.account("anna")?.id).toBe("anna");
  });

  it("finds nothing for a company that does not exist", () => {
    const nobody = companyScope(db, "nobody");
    expect(nobody.company()).toBeUndefined();
    expect(nobody.accounts()).toEqual([]);
  });

  it("refuses an account of a company that does not exist", () => {
    expect(() =>
      db.insert(accounts).values({ id: "x", companyId: "nobody", createdAt: 3 }).run(),
    ).toThrow();
  });
});

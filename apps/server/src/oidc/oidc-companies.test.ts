// K-605 (P-27): a person of the provider is one account, in one company. Several companies in one
// Kennwort account are separate accounts the home account opens; the provider never makes a second
// one. Anna, known in Weber Haustechnik, follows the join link of Müller Elektro and still gets
// only her Weber account named, no enrolment into Müller, and her groups stay with Weber.
import { describe, expect, it } from "bun:test";
import { encodeBytes } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { accounts, companies, oidcCompanies } from "../db/schema.ts";
import { oidcWeber } from "../testing/oidc-setup.ts";

const ANNA_IDP = { sub: "f3b1-anna", name: "Anna Weber", groups: ["Technik"] };
const MUELLER = encodeBytes(new Uint8Array(16).fill(9));

describe("a known person and another company's join link", () => {
  it("names the account of the own company, never enrols into the other", async () => {
    const s = await oidcWeber();
    const { db } = s.w.o.setup;
    db.insert(companies).values({ id: MUELLER, createdAt: 2 }).run();
    db.insert(oidcCompanies).values({ companyId: MUELLER, enabledBy: "max", enabledAt: 2 }).run();
    await s.login(ANNA_IDP, { token: s.w.annaToken });
    const { ticket } = await s.login(ANNA_IDP, { start: `/auth/oidc/start?company=${MUELLER}` });
    const answer = await s.request("/auth/oidc/ticket", { body: { ticket } });
    expect(await answer.json()).toEqual({ kind: "known", accountId: encodeBytes(s.w.annaId) });
    const again = await s.login(ANNA_IDP, { start: `/auth/oidc/start?company=${MUELLER}` });
    expect((await s.enrol(again.ticket ?? "")).status).toBe(410);
    expect(db.select().from(accounts).where(eq(accounts.companyId, MUELLER)).all()).toEqual([]);
  });
});

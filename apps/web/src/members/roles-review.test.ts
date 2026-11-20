import { certify, type MemberView } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { annaRow, jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import { loadMembers, setRole } from "./members.ts";

// Review of K-304 part 3: a lying server replays a certificate the owner has replaced
describe("a demotion the server undoes", () => {
  it("does not show Anna as a confirmed admin again after Jonas made her a member", async () => {
    const jonas = await jonasCompany();
    const root = jonas.opened.state.rootSecretKey;
    if (!root) throw new Error("root");
    const { row } = annaRow(jonas);
    const asMember = certify(root, {
      accountId: row.id,
      xwingPublicKey: row.xwingPublicKey as Uint8Array,
      edPublicKey: row.edPublicKey as Uint8Array,
      companyId: jonas.certificate.companyId,
      role: "member",
      issuedAt: 1,
    });
    const s = server(jonas, []);
    const view: MemberView = {
      accountId: row.id,
      name: "Anna",
      role: "member",
      status: "certified",
      certificate: asMember,
    };
    expect(await setRole(s.api, jonas.session, view, "admin")).toBe(true);
    const admin = s.roles[0]?.certificate;
    if (!admin) throw new Error("admin");
    const adminView: MemberView = { ...view, role: "admin", certificate: admin };
    expect(await setRole(s.api, jonas.session, adminView, "member")).toBe(true);
    // The server keeps the admin certificate and says Anna is still admin
    const replayed = server(jonas, [
      ownerRow(jonas),
      { ...row, role: "admin", certificate: admin, invitation: null },
    ]);
    const opened = jonas.session.opened();
    if (!opened) throw new Error("locked");
    const loaded = await loadMembers(replayed.api, opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const anna = loaded.value.views.find((v) => v.name === "Anna");
    expect({ role: anna?.role, status: anna?.status }).not.toEqual({
      role: "admin",
      status: "certified",
    });
  });
});

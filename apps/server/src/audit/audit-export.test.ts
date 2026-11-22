// K-504: only owners and admins sign an export into the audit log, naming format and scope
import { describe, expect, it } from "bun:test";
import { AuditExport, type ExportScope, encodeBytes, exportSubject } from "@kennwort/core";
import { signInSetup } from "../testing/sign-in-setup.ts";

const signature = encodeBytes(new Uint8Array(65).fill(1));
const id = (byte: number) => encodeBytes(new Uint8Array(16).fill(byte));
const subject = (scope: ExportScope, byte = 1) =>
  exportSubject({ format: "kdbx", scope, id: id(byte) });

const weber = async () => {
  const setup = await signInSetup();
  const jonas = await setup.member("weber", "owner");
  const sandra = await setup.member("weber", "admin");
  const max = await setup.member("weber", "member");
  const vaultId = id(0xb0);
  expect(
    (await setup.request("/api/vaults", { token: jonas.token, body: { id: vaultId } })).status,
  ).toBe(201);
  const post = (token: string, subjectText: string) =>
    setup.request("/api/audit", {
      token,
      body: { action: "export", subject: subjectText, signature },
    });
  return { setup, jonas, sandra, max, vaultId, post };
};

describe("export in the audit log", () => {
  it("takes an export of everything or of a vault from owners and admins", async () => {
    const { setup, jonas, sandra, vaultId, post } = await weber();
    expect((await post(jonas.token, subject({ kind: "all" }))).status).toBe(201);
    expect((await post(jonas.token, subject({ kind: "vault", vaultId }))).status).toBe(201);
    expect((await post(sandra.token, subject({ kind: "vault", vaultId }, 2))).status).toBe(201);
    const log = AuditExport.parse(
      await (await setup.request("/api/audit", { token: jonas.token })).json(),
    );
    expect(
      log.events.filter((e) => e.action === "export").map((e) => [e.actor, e.subject]),
    ).toEqual([
      [jonas.id, `kdbx/all/${id(1)}`],
      [jonas.id, `kdbx/vault:${vaultId}/${id(1)}`],
      [sandra.id, `kdbx/vault:${vaultId}/${id(2)}`],
    ]);
  });

  it("refuses a member, whatever the scope, and writes nothing", async () => {
    const { setup, jonas, max, vaultId, post } = await weber();
    expect(await post(max.token, subject({ kind: "all" }))).toMatchObject({ status: 403 });
    expect((await post(max.token, subject({ kind: "vault", vaultId }))).status).toBe(403);
    const log = AuditExport.parse(
      await (await setup.request("/api/audit", { token: jonas.token })).json(),
    );
    expect(log.events.some((e) => e.action === "export")).toBe(false);
  });

  it("refuses a subject that names no format, scope and ID", async () => {
    const { jonas, post } = await weber();
    for (const bad of ["export-1", `xml/all/${id(1)}`, `kdbx/all/${id(1)}/x`])
      expect((await post(jonas.token, bad)).status).toBe(400);
  });

  it("refuses a vault of another company or none at all", async () => {
    const { setup, jonas, post } = await weber();
    const other = await setup.member("mueller", "owner");
    const theirs = id(0xc0);
    expect(
      (await setup.request("/api/vaults", { token: other.token, body: { id: theirs } })).status,
    ).toBe(201);
    expect((await post(jonas.token, subject({ kind: "vault", vaultId: theirs }))).status).toBe(404);
    expect((await post(jonas.token, subject({ kind: "vault", vaultId: id(0xd0) }))).status).toBe(
      404,
    );
  });

  it("leaves other client actions to members as before", async () => {
    const { setup, max } = await weber();
    const posted = await setup.request("/api/audit", {
      token: max.token,
      body: { action: "recovery", subject: "r-1", signature },
    });
    expect(posted.status).toBe(201);
  });
});

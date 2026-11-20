import { type AccountUpload, certify, grantRoot } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { stateServer } from "../session/state-server.test-kit.ts";
import { jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import { MembersPage } from "./members-page.tsx";

// Review of K-304 part 3: Anna, just made admin, opens the members while saving her state fails
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  flush();
};

describe("MembersPage adopting the root key", () => {
  it("does not call a genuine root key forged when only saving the account state fails", async () => {
    const jonas = await jonasCompany();
    let upload: AccountUpload | undefined;
    const session = createSession({
      api: fakeApi({
        accept: async (_id, _token, u) => {
          upload = u;
          return { ok: true, value: "token-2" };
        },
      }),
      storage: memory(),
      derive,
    });
    await session.accept(
      "BQUFBQUFBQUFBQUFBQUFBQ",
      "einladung",
      jonas.opened.state.rootFingerprint,
      new Uint8Array(32).fill(8),
      PASSPHRASE,
    );
    const opened = session.opened();
    const root = jonas.opened.state.rootSecretKey;
    if (!opened || !upload || !root) throw new Error("accept");
    const certificate = certify(root, {
      accountId: opened.accountId,
      xwingPublicKey: opened.keyBlock.xwing.publicKey,
      edPublicKey: opened.keyBlock.ed.publicKey,
      companyId: jonas.certificate.companyId,
      role: "admin",
      issuedAt: 1,
    });
    const annaRow = {
      id: opened.accountId,
      role: "admin" as const,
      name: "Anna",
      xwingPublicKey: certificate.xwingPublicKey,
      edPublicKey: certificate.edPublicKey,
      certificate,
      invitation: null,
    };
    const state = stateServer(upload);
    const api = {
      ...server(jonas, [ownerRow(jonas), annaRow]).api,
      ...state.deps,
      // The genuine grant, but the account state cannot be read right now
      rootGrant: async () => grantRoot(root, certificate),
      keys: async () => undefined,
    };
    setLocale("de", { reload: false });
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(
      () => withQueries(() => <MembersPage session={session} api={api} origin="https://k.test" />),
      host,
    );
    flush();
    await settle();
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent ?? "").not.toContain(
      "nicht der deiner Firma",
    );
  });
});

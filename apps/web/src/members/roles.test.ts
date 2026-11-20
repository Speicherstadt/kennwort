import {
  type AccountUpload,
  type Certificate,
  certify,
  encodeBytes,
  grantRoot,
  isCertified,
  type MemberView,
  openRootGrant,
} from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { stateServer } from "../session/state-server.test-kit.ts";
import { jonasCompany, server } from "./members.test-kit.ts";
import { adoptRoot, mayChangeRoles, mayConfirm, needsRoot, setRole } from "./members.ts";

// K-304 part 3: Jonas makes Anna an admin; Anna's client takes the root key
const company = new Uint8Array(16).fill(0xc0);

/** Anna accepted Jonas's invitation on her device: her session, her upload, her certificate */
const annaDevice = async (
  jonas: Awaited<ReturnType<typeof jonasCompany>>,
  role: Certificate["role"],
) => {
  let upload: AccountUpload | undefined;
  const api = fakeApi({
    accept: async (_id, _token, u) => {
      upload = u;
      return { ok: true, value: "token-2" };
    },
  });
  const session = createSession({ api, storage: memory(), derive });
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
    companyId: company,
    role,
    issuedAt: 1,
  });
  const me: MemberView = {
    accountId: opened.accountId,
    name: "Anna",
    role,
    status: "certified",
    certificate,
  };
  return { session, opened, upload, certificate, me, root };
};

describe("who may change roles and needs the root key", () => {
  it("lets certified owners with the root key change roles; admins without it need it", async () => {
    const jonas = await jonasCompany();
    const view = { accountId: jonas.opened.accountId, name: null, status: "certified" as const };
    expect(mayChangeRoles(jonas.opened, { ...view, role: "owner" })).toBe(true);
    expect(mayChangeRoles(jonas.opened, { ...view, role: "admin" })).toBe(false);
    expect(mayChangeRoles(jonas.opened, { ...view, role: "owner", status: "waiting" })).toBe(false);
    expect(mayConfirm(jonas.opened, { ...view, role: "member" })).toBe(false);
    const anna = await annaDevice(jonas, "admin");
    expect(needsRoot(anna.opened, anna.me)).toBe(true);
    expect(needsRoot(anna.opened, { ...anna.me, role: "member" })).toBe(false);
    expect(needsRoot(jonas.opened, { ...view, role: "owner" })).toBe(false);
    expect(mayChangeRoles(anna.opened, { ...anna.me, role: "owner" })).toBe(false);
  });
});

describe("setRole", () => {
  it("sends a new certificate by the root, with the root key for an admin and without for a member", async () => {
    const jonas = await jonasCompany();
    const anna = await annaDevice(jonas, "member");
    const s = server(jonas, []);
    const view = { ...anna.me };
    expect(await setRole(s.api, jonas.opened, view, "admin")).toBe(true);
    expect(await setRole(s.api, jonas.opened, view, "member")).toBe(true);
    const [admin, member] = s.roles;
    expect(admin?.certificate.role).toBe("admin");
    expect(isCertified(jonas.rootPublicKey, admin?.certificate as Certificate)).toBe(true);
    expect(
      openRootGrant(
        anna.opened.keyBlock,
        anna.opened.accountId,
        company,
        admin?.rootGrant ?? new Uint8Array(),
      ),
    ).toEqual({
      ok: true,
      value: anna.root,
    });
    expect(member?.certificate.role).toBe("member");
    expect(member?.rootGrant).toBeUndefined();
  });

  it("does nothing without the root key or a certificate", async () => {
    const jonas = await jonasCompany();
    const anna = await annaDevice(jonas, "member");
    const s = server(jonas, []);
    const { certificate: _, ...uncertified } = anna.me;
    expect(await setRole(s.api, jonas.opened, uncertified, "admin")).toBe(false);
    expect(await setRole(s.api, anna.opened, anna.me, "admin")).toBe(false);
    expect(s.roles).toEqual([]);
  });
});

describe("adoptRoot", () => {
  it("keeps the root key an owner wrapped to Anna in her account state", async () => {
    const jonas = await jonasCompany();
    const anna = await annaDevice(jonas, "admin");
    const state = stateServer(anna.upload);
    const grant = grantRoot(anna.root, anna.certificate);
    const api = { ...server(jonas, []).api, ...state.deps, rootGrant: async () => grant };
    expect(await adoptRoot(api, anna.session, anna.me)).toEqual({ ok: true });
    expect(anna.session.opened()?.state.rootSecretKey).toEqual(anna.root);
    expect(state.current().stateCounter).toBe(1);
  });

  it("refuses a root key that is not the pinned one, and says when there is none", async () => {
    const jonas = await jonasCompany();
    const anna = await annaDevice(jonas, "admin");
    const state = stateServer(anna.upload);
    const base = { ...server(jonas, []).api, ...state.deps };
    const forged = grantRoot(ed25519KeyPair().secretKey, anna.certificate);
    expect(
      await adoptRoot({ ...base, rootGrant: async () => forged }, anna.session, anna.me),
    ).toEqual({
      ok: false,
      error: "other-root",
    });
    expect(await adoptRoot(base, anna.session, anna.me)).toEqual({ ok: false, error: "none" });
    const { certificate: _, ...uncertified } = anna.me;
    expect(await adoptRoot(base, anna.session, uncertified)).toEqual({
      ok: false,
      error: "failed",
    });
    const noState = {
      ...base,
      rootGrant: async () => grantRoot(anna.root, anna.certificate),
      keys: async () => undefined,
    };
    expect(await adoptRoot(noState, anna.session, anna.me)).toEqual({ ok: false, error: "failed" });
    expect(state.current().stateCounter).toBe(0);
    expect(encodeBytes(anna.opened.accountId)).toHaveLength(22);
  });
});

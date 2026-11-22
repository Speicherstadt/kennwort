/** What the members tests share: Jonas's company, Anna's answer and a server in memory */
import type { RecoveryApi } from "@kennwort/client/session/recovery-api.ts";
import {
  type AccountUpload,
  type Certificate,
  createAccount,
  emptyState,
  encodeBytes,
  invitationMac,
  type MembersWire,
  newInvitation,
} from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { stateServer } from "../session/state-server.test-kit.ts";
import type { MembersDeps } from "./members.ts";

export type Row = Parameters<typeof MembersWire.parse>[0] extends unknown
  ? ReturnType<typeof MembersWire.parse>["members"][number]
  : never;

export const jonasCompany = async () => {
  let upload: AccountUpload | undefined;
  let certificate: Certificate | undefined;
  const api = fakeApi({
    setup: async (_code, _companyId, u) => {
      upload = u;
      return { ok: true, value: "token-1" };
    },
    uploadKeys: async (_t, _u, c) => {
      certificate = c;
      return true;
    },
  });
  const session = createSession({ api, storage: memory(), derive });
  await session.setUp("richtiger-code", PASSPHRASE);
  const opened = session.opened();
  if (!opened || !upload || !certificate || !opened.state.rootSecretKey) throw new Error("setup");
  const rootPublicKey = ed25519KeyPair(opened.state.rootSecretKey).publicKey;
  return { session, opened, upload, certificate, rootPublicKey };
};

export const ownerRow = (c: Awaited<ReturnType<typeof jonasCompany>>): Row => ({
  id: c.opened.accountId,
  role: "owner",
  name: null,
  xwingPublicKey: c.certificate.xwingPublicKey,
  edPublicKey: c.certificate.edPublicKey,
  certificate: c.certificate,
  invitation: null,
});

/** Anna answered Jonas's invitation; `secret` lets a test make the MAC with another secret */
export const annaRow = (c: Awaited<ReturnType<typeof jonasCompany>>, secret?: Uint8Array) => {
  const invitation = newInvitation(c.opened.accountKey, c.opened.accountId);
  const anna = createAccount(
    "Anna Heizung Bad Fliese",
    emptyState(c.opened.state.rootFingerprint),
    { derive },
  );
  const bundle = {
    accountId: anna.accountId,
    xwingPublicKey: anna.upload.xwingPublicKey,
    edPublicKey: anna.upload.edPublicKey,
  };
  const row: Row = {
    id: anna.accountId,
    role: "member",
    name: "Anna",
    xwingPublicKey: bundle.xwingPublicKey,
    edPublicKey: bundle.edPublicKey,
    certificate: null,
    invitation: {
      id: invitation.id,
      sealedSecret: invitation.sealedSecret,
      mac: invitationMac(secret ?? invitation.secret, invitation.id, bundle),
    },
  };
  return { row, invitation, account: anna };
};

/** A company without company recovery (K-307 part c): no key, no grant, no deposit */
export const noRecovery: RecoveryApi = {
  saveRecoveryKey: async () => false,
  recoveryGrant: async () => undefined,
  heldDeposit: async () => undefined,
  saveDeposit: async () => false,
  memberRecovery: async () => undefined,
  answerRecovery: async () => false,
  auditAction: async () => false,
};

export const server = (c: Awaited<ReturnType<typeof jonasCompany>>, rows: Row[]) => {
  const state = stateServer(c.upload);
  const calls: string[] = [];
  const left: Uint8Array[] = [];
  const certified: Certificate[] = [];
  const roles: { certificate: Certificate; rootGrant: Uint8Array | undefined }[] = [];
  const api: MembersDeps = {
    ...state.deps,
    writeState: async (...args) => {
      calls.push("state");
      return state.deps.writeState(...args);
    },
    company: async () => ({
      id: "weber",
      rootPublicKey: c.rootPublicKey,
      policy: null,
      recoveryPublicKey: null,
    }),
    members: async () => rows,
    invite: async () => ({ token: "einmal", expiresAt: 1 }),
    certify: async (_token, certificate) => {
      calls.push("certify");
      certified.push(certificate);
      return true;
    },
    rootGrant: async () => undefined,
    savePolicy: async () => true,
    ...noRecovery,
    changeRole: async (_token, certificate, rootGrant) => {
      calls.push("role");
      roles.push({ certificate, rootGrant });
      return true;
    },
    // as the real server: the account is marked as left and listed with the time
    leave: async (_token, accountId) => {
      calls.push("leave");
      left.push(accountId);
      const index = rows.findIndex((row) => encodeBytes(row.id) === encodeBytes(accountId));
      const row = rows[index];
      if (row) rows[index] = { ...row, leftAt: 1_800_000_000_000 };
      return row !== undefined;
    },
  };
  return { api, calls, certified, roles, state, left };
};

// Weber Haustechnik for the company recovery tests (K-307 part c): Jonas, owner, and Anna, a real
// account (her key block opens with her AK) that Jonas certified; helpers to make a recovery key
// and to deposit, both as the clients do it with packages/core
import {
  bytes,
  type Certificate,
  certify,
  createAccount,
  depositFor,
  depositToWire,
  emptyState,
  encodeBytes,
  grantRecoveryKey,
  newCompanyRecoveryKey,
  type Policy,
  PolicyWire,
  recoveryKeyToWire,
  recoveryPolicy,
  standardPolicy,
  toWire,
} from "@kennwort/core";
import { rootFingerprint } from "@kennwort/crypto";
import { ownerWithKeys, quick } from "./owner-with-keys.ts";
import { invitationBody } from "./sign-in-setup.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";

const keysBody = (upload: ReturnType<typeof createAccount>["upload"]) => ({
  xwingPublicKey: encodeBytes(upload.xwingPublicKey),
  edPublicKey: encodeBytes(upload.edPublicKey),
  keyBlock: encodeBytes(upload.keyBlock),
  unlock: {
    passphrase: encodeBytes(upload.unlock.passphrase),
    recovery: encodeBytes(upload.unlock.recovery),
  },
  recoveryLoginPublicKey: encodeBytes(upload.recoveryLoginPublicKey),
  state: encodeBytes(upload.state),
  stateCounter: 0,
});

export const weberWithAnna = async (apiClock = false) => {
  const o = await ownerWithKeys(CODE, PASSPHRASE, true, apiClock);
  const root = o.owner.state.rootSecretKey;
  if (!root) throw new Error("the owner holds the root key");
  const made = await o.setup.request("/api/invitations", {
    token: o.token,
    body: invitationBody("Anna"),
  });
  const { id, token } = (await made.json()) as { id: string; token: string };
  const anna = createAccount(
    "Anna Heizung Bad Fliese",
    emptyState(rootFingerprint(o.company.rootPublicKey)),
    {
      derive: quick,
    },
  );
  const accepted = await o.setup.request(`/auth/invitations/${id}/accept`, {
    body: {
      token,
      accountId: encodeBytes(anna.accountId),
      loginPublicKey: encodeBytes(anna.upload.loginPublicKey),
      accountSalt: encodeBytes(anna.upload.accountSalt),
    },
  });
  const annaToken = ((await accepted.json()) as { token: string }).token;
  await o.setup.request("/api/account/keys", {
    method: "PUT",
    token: annaToken,
    body: keysBody(anna.upload),
  });
  const annaCert: Certificate = certify(root, {
    ...o.company.certificate,
    accountId: anna.accountId,
    xwingPublicKey: anna.upload.xwingPublicKey,
    edPublicKey: anna.upload.edPublicKey,
    role: "member",
  });
  await o.setup.request(`/api/members/${encodeBytes(anna.accountId)}/certificate`, {
    method: "PUT",
    token: o.token,
    body: toWire(annaCert),
  });
  return { o, root, anna, annaToken, annaCert, annaIdText: encodeBytes(anna.accountId) };
};
export type WeberWithAnna = Awaited<ReturnType<typeof weberWithAnna>>;

export const policyOf = async (w: WeberWithAnna): Promise<Policy | null> => {
  const company = (await (
    await w.o.setup.request("/api/company", { token: w.o.token })
  ).json()) as {
    policy: unknown;
  };
  return company.policy ? PolicyWire.parse(company.policy) : null;
};

/** Jonas makes a recovery key, wraps it to the owners given (only himself by default) and signs */
export const makeRecoveryKey = async (
  w: WeberWithAnna,
  owners: Certificate[] = [w.o.company.certificate],
  change: (policy: Policy) => Policy = (p) => p,
) => {
  const key = newCompanyRecoveryKey();
  const current = (await policyOf(w)) ?? standardPolicy(w.o.company.companyId);
  const policy = change(recoveryPolicy(w.root, current, key.fingerprint));
  const grants = owners.map((c) => ({
    accountId: c.accountId,
    grant: grantRecoveryKey(key.secretKey, c),
  }));
  const answer = await w.o.setup.request("/api/company/recovery-key", {
    method: "PUT",
    token: w.o.token,
    body: recoveryKeyToWire(policy, key.publicKey, grants),
  });
  return { key, policy, status: answer.status };
};

/** Anna deposits her AK to the key, as her client does once the policy asks for it */
export const annaDeposits = async (w: WeberWithAnna, policy: Policy, publicKey: Uint8Array) => {
  const decided = depositFor(policy, publicKey, undefined, w.anna);
  if (decided.kind !== "deposit") throw new Error(`expected a deposit, not ${decided.kind}`);
  const answer = await w.o.setup.request("/api/account/recovery-deposit", {
    method: "PUT",
    token: w.annaToken,
    body: depositToWire(decided.deposit),
  });
  return { deposit: decided.deposit, status: answer.status };
};

export const b = (value: unknown) => bytes().parse(value);

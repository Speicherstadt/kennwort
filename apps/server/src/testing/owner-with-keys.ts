// An owner who set up a company and (unless told otherwise) uploaded the keys, with a post() for
// the sign-in helpers of packages/core; for the account tests of K-303
import { createCompany, encodeBytes, toWire } from "@kennwort/core";
import { passphraseKeysWith } from "@kennwort/crypto";
import { signInSetup } from "./sign-in-setup.ts";

/** Argon2id light enough for tests; the real parameters are in packages/crypto (F-05) */
export const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);

export const ownerWithKeys = async (code: string, passphrase: string, uploadKeys = true) => {
  const setup = await signInSetup({ setupCode: code, empty: true });
  const company = createCompany(passphrase, { derive: quick });
  const { owner } = company;
  const response = await setup.request("/auth/setup", {
    body: {
      code,
      companyId: encodeBytes(company.companyId),
      accountId: encodeBytes(owner.accountId),
      loginPublicKey: encodeBytes(owner.upload.loginPublicKey),
      accountSalt: encodeBytes(owner.upload.accountSalt),
      rootPublicKey: encodeBytes(company.rootPublicKey),
    },
  });
  const { token } = (await response.json()) as { token: string };
  const u = owner.upload;
  if (uploadKeys)
    await setup.request("/api/account/keys", {
      method: "PUT",
      token,
      body: {
        xwingPublicKey: encodeBytes(u.xwingPublicKey),
        edPublicKey: encodeBytes(u.edPublicKey),
        keyBlock: encodeBytes(u.keyBlock),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        state: encodeBytes(u.state),
        stateCounter: 0,
        certificate: toWire(company.certificate),
      },
    });
  const post = async (path: string, body: unknown) => {
    const answer = await setup.request(path, { body });
    return { status: answer.status, json: await answer.json() };
  };
  return { setup, owner, company, token, post };
};

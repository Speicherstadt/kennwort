// Weber Haustechnik for the emergency access tests (K-307 part d, P-14): Jonas (owner) with the
// vault Büro, Anna certified; Jonas names Anna, both as their clients do it with packages/core, on
// a server whose API runs on the test's clock
import {
  createVault,
  type EmergencyGrant,
  encodeBytes,
  type GrantKeys,
  grantToWire,
  makeGrant,
  packagesToWire,
  signStatement,
  statementToWire,
  toWire,
} from "@kennwort/core";
import type { EmergencyStatement as Kind } from "@kennwort/crypto";
import { weberWithAnna } from "./recovery-setup.ts";

export const DAY = 86_400;

export const weberWithBuero = async () => {
  const w = await weberWithAnna(true);
  const seconds = () => Math.floor(w.o.setup.clock.now() / 1000);
  const jonas = { id: w.o.owner.accountId, edSecretKey: w.o.owner.keyBlock.ed.secretKey };
  const signer = { accountId: jonas.id, edSecretKey: jonas.edSecretKey };
  const buero = createVault(signer, w.o.company.certificate, seconds() - 60);
  const vaultId = encodeBytes(buero.ring.vaultId);
  await w.o.setup.request("/api/vaults", { token: w.o.token, body: { id: vaultId } });
  await w.o.setup.request(`/api/vaults/${vaultId}/log`, {
    token: w.o.token,
    body: { entry: toWire(buero.genesis), wrappedKey: encodeBytes(buero.wrappedKey) },
  });
  const jonasIdText = encodeBytes(jonas.id);
  const request = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
    w.o.setup.request(path, { token: w.o.token, ...init });
  /** Jonas grants Anna view access to Büro (or what `keys` says) and stores it */
  const grant = async (
    keys: GrantKeys = { scope: "view", rings: [buero.ring] },
    terms = { waitSeconds: 7 * DAY, time: seconds() },
  ) => {
    const made = makeGrant(jonas, w.annaCert, keys, terms);
    const answer = await request(`/api/emergency/${w.annaIdText}`, {
      method: "PUT",
      body: { grant: grantToWire(made.grant), packages: packagesToWire(made.packages) },
    });
    return { ...made, status: answer.status };
  };
  /** A statement signed by Jonas (grantor) or Anna (grantee) */
  const statement = (kind: Kind, by: "jonas" | "anna", grantMade: EmergencyGrant, at = seconds()) =>
    statementToWire(
      signStatement(
        kind,
        by === "jonas" ? jonas.edSecretKey : w.anna.keyBlock.ed.secretKey,
        grantMade,
        at,
      ),
    );
  const annaRequests = (grantMade: EmergencyGrant, at = seconds()) =>
    request(`/api/emergency/${jonasIdText}/request`, {
      token: w.annaToken,
      body: statement("emergency-request", "anna", grantMade, at),
    });
  const release = (token = w.annaToken) =>
    request(`/api/emergency/${jonasIdText}/release`, { token });
  return {
    w,
    jonas,
    jonasIdText,
    buero,
    vaultId,
    seconds,
    request,
    grant,
    statement,
    annaRequests,
    release,
  };
};
export type WeberWithBuero = Awaited<ReturnType<typeof weberWithBuero>>;

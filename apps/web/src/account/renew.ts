/**
 * Renewing the account's keys in the web app (K-307 part e, P-12), without any interface: the new
 * keys made and sent (renewKeys), the account opened under them with a new offline copy, the
 * company recovery deposit made anew for the new AK, and the code an owner or admin compares to
 * certify the new bundle. An owner or admin who holds the root key certifies the own bundle at
 * once; the vaults follow once the certificate is there (vaults/renewals.ts).
 */
import { type RenewalApi, type RenewalError, renewKeys } from "@kennwort/client/account/renewal.ts";
import { keepDeposit } from "@kennwort/client/policy/recovery.ts";
import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import {
  type AccountState,
  certifyRenewed,
  type Derive,
  encodeBytes,
  type MemberView,
} from "@kennwort/core";
import { bundleFingerprint, comparisonCode, keyBlockFingerprint } from "@kennwort/crypto";
import { loadMembers, type MembersDeps } from "../members/members.ts";
import type { NewKeys, Session } from "../session/session.ts";

export type RenewDeps = RenewalApi & MembersDeps;

export type RenewError = RenewalError | "locked";
export type RenewDone = {
  keys: NewKeys;
  /** The new bundle's comparison code (F-04), for the owner or admin who certifies it */
  code: string;
  /** Whether this account certified its own new bundle (it holds the root key) */
  certified: boolean;
};

const seconds = () => Math.floor(Date.now() / 1000);

/** The comparison code of a member's renewed bundle, as the owner or admin compares it */
export const renewedCode = (view: MemberView) =>
  view.renewed
    ? comparisonCode(bundleFingerprint(view.renewed.xwingPublicKey, view.renewed.edPublicKey))
    : undefined;

/** The new certificate remembered with its bundle, so no earlier one counts on these devices */
const remembering = (state: AccountState, view: MemberView, issuedAt: number): AccountState => {
  const id = encodeBytes(view.accountId);
  const renewed = view.renewed as NonNullable<MemberView["renewed"]>;
  return {
    ...state,
    certificates: { ...state.certificates, [id]: issuedAt },
    bundles: {
      ...state.bundles,
      [id]: bundleFingerprint(renewed.xwingPublicKey, renewed.edPublicKey),
    },
  };
};

/**
 * An owner or admin certifies a member's renewed bundle after comparing its code with the person
 * (P-12); the certificate is remembered before it is uploaded, like an invitation's (P-08)
 */
export const confirmRenewed = async (
  api: MembersDeps,
  session: Session,
  view: MemberView,
  company: Uint8Array | undefined,
) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root || !company) return false;
  const seen = opened.state.certificates[encodeBytes(view.accountId)] ?? 0;
  const certificate = certifyRenewed(root, view, company, seconds(), seen);
  if (!certificate) return false;
  const remembered = await session.updateState(api, (state) =>
    remembering(state, view, certificate.issuedAt),
  );
  return remembered.ok && (await api.certify(opened.token, certificate));
};

/** An owner or admin with the root key certifies its own renewed bundle: it is the same person */
const certifyOwn = async (api: MembersDeps, session: Session, wasAdmin: boolean) => {
  const opened = session.opened();
  if (!wasAdmin || !opened?.state.rootSecretKey) return false;
  const loaded = await loadMembers(api, opened);
  if (!loaded.ok || loaded.value.me?.status !== "renewed") return false;
  const { me } = loaded.value;
  return confirmRenewed(api, session, me, me.previous?.at(-1)?.companyId);
};

export const renewAccount = async (
  api: RenewDeps,
  session: Session,
  loaded: Loaded | undefined,
  passphrase: string,
  derive?: Derive,
): Promise<{ ok: true; value: RenewDone } | { ok: false; error: RenewError }> => {
  const opened = session.opened();
  const device = session.device();
  if (!opened || !device) return { ok: false, error: "locked" };
  const id = encodeBytes(opened.accountId);
  const me = loaded?.people.find((p) => encodeBytes(p.accountId) === id);
  const renewed = await renewKeys(api, opened, {
    passphrase,
    secretKey: device.secretKey,
    rings: loaded?.vaults.flatMap((v) => [v.ring, ...v.older]) ?? [],
    companyId: me?.certificate?.companyId,
    derive,
  });
  if (!renewed.ok) return renewed;
  await session.renewed(renewed.value);
  const next = renewed.value.opened;
  await keepDeposit(api, next);
  const wasAdmin = me?.role === "owner" || me?.role === "admin";
  const certified = await certifyOwn(api, session, wasAdmin);
  return {
    ok: true,
    value: {
      keys: {
        accountId: next.accountId,
        secretKey: renewed.value.secretKey,
        recoveryKey: renewed.value.recoveryKey,
      },
      code: comparisonCode(keyBlockFingerprint(next.keyBlock)),
      certified,
    },
  };
};

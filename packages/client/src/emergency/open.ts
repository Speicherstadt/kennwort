/**
 * The grantee opens what emergency access released (K-307 part d, P-14): the release must pass
 * checkRelease (its own request, the waiting time by its own clock or the grantor's signed early
 * approval, no objection it has seen), every vault's log must verify, and every key must match both
 * the grant and the log (view) or open the grantor's certified key block (full). Only then are the
 * entries read, read-only, and the access signed into the audit log.
 */
import {
  type Certificate,
  certificateFingerprint,
  checkRelease,
  type EmergencyGrant,
  type EmergencyVaults,
  type EntryContent,
  encodeBytes,
  type Keyring,
  type LogState,
  openEmergencyAccount,
  openEmergencyVault,
  openRecord,
  openRings,
  openVaultName,
  type Release,
  signAudit,
  type Trust,
  verifyLog,
} from "@kennwort/core";
import type { KeyBlock } from "@kennwort/crypto";
import type { Opened } from "../session/open-account.ts";
import type { RecoveryApi } from "../session/recovery-api.ts";
import type { EmergencyDeps, Received } from "./emergency.ts";

export type OpenedVault = {
  idText: string;
  name: string | undefined;
  entries: { id: string; content: EntryContent }[];
  /** Vaults a check refused, with the reason; their entries stay closed */
  error?: string;
};
export type OpenError =
  | "unreachable"
  | "none"
  | "waiting"
  | "objected"
  | "not-my-request"
  | "not-authentic"
  | "not-committed"
  | "no-package"
  | "wrong-key-block"
  | "wrong-root";

type Served = EmergencyVaults["vaults"][number];
type Rings = { current: Keyring; older: Keyring[] };
type RingsOf = (
  served: Served,
  log: LogState,
) => { ok: true; value: Rings } | { ok: false; error: string };

const readVault = (served: Served, log: LogState, rings: Rings, trust: Trust): OpenedVault => {
  const all = [rings.current, ...rings.older];
  const nameRing = all.find((r) => r.epoch === served.nameEpoch);
  const name = served.name && nameRing ? openVaultName(nameRing, served.name) : undefined;
  const entries = served.records.flatMap((record) => {
    const ring = all.find((r) => r.epoch === record.epoch);
    const content = ring ? openRecord(record, ring, log, trust, 0) : undefined;
    return content?.ok ? [{ id: encodeBytes(record.entryId), content: content.value }] : [];
  });
  return { idText: encodeBytes(served.id), name: name?.ok ? name.value : undefined, entries };
};

/** View: the one key per vault that grant and log both bind */
const viewRings =
  (grant: EmergencyGrant, release: Release, opened: Opened, me: Certificate) =>
  (served: Served, log: LogState) => {
    const reader = {
      secretKey: opened.keyBlock.xwing.secretKey,
      fingerprint: certificateFingerprint(me),
    };
    const ring = openEmergencyVault(grant, release.packages, reader, served.id, log);
    return ring.ok ? { ok: true as const, value: { current: ring.value, older: [] } } : ring;
  };

/** Full: the grantor's keys, as the grantor's own client opens them (openRings) */
const fullRings = (grantorId: Uint8Array, block: KeyBlock) => (served: Served, log: LogState) =>
  openRings(block, grantorId, log, served.id, served.keys);

const openVaults = (
  vaults: EmergencyVaults["vaults"],
  trust: Trust,
  ringsOf: (
    served: Served,
    log: LogState,
  ) => { ok: true; value: Rings } | { ok: false; error: string },
): OpenedVault[] =>
  vaults.map((served) => {
    const idText = encodeBytes(served.id);
    const log = verifyLog(served.id, served.log, trust);
    if (!log.ok) return { idText, name: undefined, entries: [], error: log.error };
    const rings = ringsOf(served, log.value);
    if (!rings.ok) return { idText, name: undefined, entries: [], error: rings.error };
    return readVault(served, log.value, rings.value, trust);
  });

/** The access, signed by the grantee into the audit log once per released request (P-20) */
const auditAccess = async (api: RecoveryApi, opened: Opened, me: Certificate, release: Release) => {
  const event = {
    companyId: encodeBytes(me.companyId),
    actor: encodeBytes(opened.accountId),
    action: "emergency-access" as const,
    subject: `${encodeBytes(release.request.grantor)}/${release.request.at}`,
  };
  const signature = signAudit(opened.keyBlock.ed.secretKey, event);
  // A second opening of the same release is already in the log: the server answers duplicate
  await api.auditAction(opened.token, event.action, event.subject, signature);
};

export const openReleased = async (
  api: EmergencyDeps & RecoveryApi,
  opened: Opened,
  checked: { received: Received; trust: Trust; me: Certificate },
): Promise<{ ok: true; value: OpenedVault[] } | { ok: false; error: OpenError }> => {
  const { received, trust, me } = checked;
  const { grant, grantor } = received;
  const release = await api.emergencyRelease(opened.token, grant.grantor);
  if (!release.ok) return release;
  const seen = opened.state.emergency[encodeBytes(grant.grantor)];
  const now = Math.floor(Date.now() / 1000);
  const allowed = checkRelease(grant, release.value, { grantor, me }, seen, now);
  if (!allowed.ok) return allowed;
  let ringsOf: RingsOf = viewRings(grant, release.value, opened, me);
  if (grant.scope === "full") {
    const account = openEmergencyAccount(
      grant,
      release.value.packages,
      {
        secretKey: opened.keyBlock.xwing.secretKey,
        fingerprint: certificateFingerprint(me),
      },
      {
        grantor,
        sealedKeyBlock: release.value.keyBlock ?? new Uint8Array(),
        rootFingerprint: opened.state.rootFingerprint,
      },
    );
    if (!account.ok) return account;
    ringsOf = fullRings(grant.grantor, account.value.keyBlock);
  }
  const vaults = await api.emergencyVaults(opened.token, grant.grantor);
  if (!vaults) return { ok: false, error: "unreachable" };
  await auditAccess(api, opened, me, release.value);
  return { ok: true, value: openVaults(vaults, trust, ringsOf) };
};

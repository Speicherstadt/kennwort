/**
 * The attacks on a handover (K-605, P-27): Jonas, the installer, made the vault in the customer's
 * company, added Max, the customer, as manager and reduced himself to editing. A server on his
 * side, or Jonas with a server, tries to get the management back: a role entry Jonas signs for
 * himself, the log played back to before his reduction or forked after Max joined (E-06, E-07 of
 * the catalog after the ETH study). Each test names its attack; Max's client must notice it.
 */
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../membership/log-entry.ts";
import { addMember, changeAccess, createVault } from "../membership/vault-ops.ts";
import { idKey, remember, verifyLog } from "../membership/verify-log.ts";
import { certificate, jonas, max, type Person, trust } from "../sync/test/fixtures.ts";

const signer = (p: Person) => ({ accountId: p.id, edSecretKey: p.ed.secretKey });
const T = 1_800_000_000;

/** The handover as the installer's device does it: create, add the customer, reduce himself */
const handedOver = () => {
  const made = createVault(signer(jonas), certificate(jonas), T, (n) => new Uint8Array(n).fill(7));
  const { vaultId } = made.ring;
  const created = verifyLog(vaultId, [made.genesis], trust);
  if (!created.ok) throw new Error(created.error);
  const add = addMember(
    signer(jonas),
    created.value,
    made.ring,
    certificate(max),
    { role: "manage", validUntil: 0 },
    T + 1,
  ).entry;
  const withMax = verifyLog(vaultId, [made.genesis, add], trust);
  if (!withMax.ok) throw new Error(withMax.error);
  const reduce = changeAccess(
    signer(jonas),
    withMax.value,
    vaultId,
    jonas.id,
    { role: "edit", validUntil: 0 },
    T + 2,
  );
  const entries: LogEntry[] = [made.genesis, add, reduce];
  const checked = verifyLog(vaultId, entries, trust);
  if (!checked.ok) throw new Error(checked.error);
  return { vaultId, entries, state: checked.value, withMax: withMax.value };
};

describe("attacks on a handed-over vault", () => {
  it("leaves the customer the only manager, the installer an editor", () => {
    const { state } = handedOver();
    expect(state.members.get(idKey(max.id))?.role).toBe("manage");
    expect(state.members.get(idKey(jonas.id))?.role).toBe("edit");
  });

  it("refuses a role entry the installer signs to make himself a manager again (E-06)", () => {
    const { vaultId, entries, state } = handedOver();
    const back = changeAccess(
      signer(jonas),
      state,
      vaultId,
      jonas.id,
      { role: "manage", validUntil: 0 },
      T + 3,
    );
    expect(verifyLog(vaultId, [...entries, back], trust)).toEqual({
      ok: false,
      error: "not-manager",
    });
    // Nor can he take the customer out of the vault
    const demote = changeAccess(
      signer(jonas),
      state,
      vaultId,
      max.id,
      { role: "read", validUntil: 0 },
      T + 3,
    );
    expect(verifyLog(vaultId, [...entries, demote], trust).ok).toBe(false);
  });

  it("notices a log played back to before the installer's reduction (E-07)", () => {
    const { vaultId, entries, state } = handedOver();
    expect(verifyLog(vaultId, entries.slice(0, 2), trust, remember(state))).toEqual({
      ok: false,
      error: "rollback",
    });
  });

  it("notices a log that forks after the customer joined: another entry at the reduction's place (E-07)", () => {
    const { vaultId, entries, state, withMax } = handedOver();
    const fork = changeAccess(
      signer(jonas),
      withMax,
      vaultId,
      max.id,
      { role: "edit", validUntil: 0 },
      T + 2,
    );
    const forked = [entries[0] as LogEntry, entries[1] as LogEntry, fork];
    expect(verifyLog(vaultId, forked, trust, remember(state)).ok).toBe(false);
  });
});

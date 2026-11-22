/** A server in memory for the renewal of keys (K-307 part e): Jonas's company, as the real one answers */
import type { StateWrite } from "@kennwort/client/session/members-api.ts";
import type { Certificate, RekeyUpload, Stored } from "@kennwort/core";
import { jonasCompany, ownerRow, type Row, server } from "../members/members.test-kit.ts";

export const renewalServer = async () => {
  const c = await jonasCompany();
  const rows: Row[] = [ownerRow(c)];
  const s = server(c, rows);
  let stored: Stored = { ...c.upload, stateCounter: 0 };
  const uploads: RekeyUpload[] = [];
  const api = {
    ...s.api,
    keys: async () => stored,
    writeState: async (_t: string, sealed: Uint8Array, counter: number): Promise<StateWrite> => {
      s.calls.push("state");
      if (counter !== stored.stateCounter + 1) return { ok: false, stale: true };
      stored = { ...stored, state: sealed, stateCounter: counter };
      return { ok: true };
    },
    // As the real server: everything replaced, the old certificate in the history
    rekey: async (_t: string, upload: RekeyUpload) => {
      uploads.push(upload);
      stored = { ...stored, ...upload };
      rows[0] = {
        ...(rows[0] as Row),
        xwingPublicKey: upload.xwingPublicKey,
        edPublicKey: upload.edPublicKey,
        certificate: null,
        previous: [c.certificate],
      };
      return "ok" as const;
    },
    certify: async (token: string, certificate: Certificate) => {
      await s.api.certify(token, certificate);
      rows[0] = { ...(rows[0] as Row), certificate };
      return true;
    },
  };
  return { c, s, api, uploads, rows };
};

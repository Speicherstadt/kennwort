// K-602 (RFC 8292): the VAPID key and JWT, checked with node:crypto as an independent verifier
import { describe, expect, it } from "bun:test";
import { createPublicKey, verify } from "node:crypto";
import { encodeBytes } from "@kennwort/core";
import { migrate, openDatabase } from "../db/database.ts";
import { serverKeys } from "../db/schema.ts";
import { TEST_VAPID_JWK } from "../testing/vapid-test-key.ts";
import { importVapid, loadVapid, vapidAuthorization, vapidJwt } from "./vapid.ts";

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const NOW = 1_800_000_000_000;

describe("vapidJwt", () => {
  it("is an ES256 JWT for the push service's origin that node:crypto verifies", async () => {
    const vapid = await importVapid(TEST_VAPID_JWK);
    const jwt = await vapidJwt(
      vapid,
      "https://fcm.googleapis.com",
      "https://kennwort.example",
      NOW,
    );
    const [header = "", claims = "", signature = ""] = jwt.split(".");
    expect(decode(header)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(decode(claims)).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: NOW / 1000 + 12 * 3600,
      sub: "https://kennwort.example",
    });
    const publicKey = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: TEST_VAPID_JWK.x, y: TEST_VAPID_JWK.y },
      format: "jwk",
    });
    const raw = Buffer.from(signature, "base64url");
    expect(raw).toHaveLength(64);
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      raw,
    );
    expect(ok).toBe(true);
    // A changed claim no longer verifies
    const forged = Buffer.from(`${header}.${encodeBytes(new TextEncoder().encode("{}"))}`);
    expect(verify("sha256", forged, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(
      false,
    );
  });

  it("puts the 65-byte public key next to the JWT, for the origin of the address only", async () => {
    const vapid = await importVapid(TEST_VAPID_JWK);
    expect(vapid.publicKey).toHaveLength(65);
    expect(vapid.publicKey[0]).toBe(4);
    const header = await vapidAuthorization(
      vapid,
      "https://updates.push.services.mozilla.com/wpush/v2/secret-token",
      "mailto:admin@weber.example",
      NOW,
    );
    const match = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(header);
    expect(match?.[2]).toBe(encodeBytes(vapid.publicKey));
    const claims = decode(match?.[1]?.split(".")[1] ?? "");
    expect(claims.aud).toBe("https://updates.push.services.mozilla.com");
    expect(JSON.stringify(claims)).not.toContain("secret-token");
  });
});

describe("loadVapid", () => {
  it("makes a key on the first need, keeps it, and gives the same one after", async () => {
    const db = openDatabase(":memory:");
    migrate(db);
    let made = 0;
    const make = async () => {
      made += 1;
      return TEST_VAPID_JWK;
    };
    const first = await loadVapid(db, NOW, make);
    const second = await loadVapid(db, NOW + 1, make);
    expect(made).toBe(1);
    expect(second.publicKey).toEqual(first.publicKey);
    expect(db.select().from(serverKeys).all()).toHaveLength(1);
  });

  it("makes a real P-256 key by default", async () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const vapid = await loadVapid(db, NOW);
    expect(vapid.publicKey).toHaveLength(65);
  });
});

import { ed25519KeyPair, verify } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { answerChallenge, answerDeletionChallenge, DELETION_PURPOSE } from "./sign-in.ts";

// K-607 (P-28): deleting the account is confirmed with the sign-in key, under a purpose of its own
const challenge = new Uint8Array(32).fill(5);
const { secretKey, publicKey } = ed25519KeyPair(new Uint8Array(32).fill(3));

describe("the answer that confirms a deletion", () => {
  it("signs for purpose delete-account, bound to account and challenge", () => {
    expect(DELETION_PURPOSE).toBe("delete-account");
    const signature = answerDeletionChallenge(secretKey, "anna", challenge);
    expect(verify(publicKey, signature, "delete-account", "anna", challenge)).toBe(true);
    expect(verify(publicKey, signature, "delete-account", "jonas", challenge)).toBe(false);
    const other = new Uint8Array(32).fill(6);
    expect(verify(publicKey, signature, "delete-account", "anna", other)).toBe(false);
  });

  it("never counts as a sign-in, and a sign-in never counts as a deletion", () => {
    const deletion = answerDeletionChallenge(secretKey, "anna", challenge);
    expect(verify(publicKey, deletion, "login", "anna", challenge)).toBe(false);
    const login = answerChallenge(secretKey, "anna", challenge);
    expect(verify(publicKey, login, "delete-account", "anna", challenge)).toBe(false);
  });
});

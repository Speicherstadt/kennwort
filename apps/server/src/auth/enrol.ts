/**
 * Creates an account in a company with its sign-in key: the Better Auth user (its ID is the account
 * ID the device chose), the account row and the login key, the rows in one transaction with what
 * the caller adds (the claimed invitation, the new company). Undefined when the ID is taken.
 */
import { encodeBytes } from "@kennwort/core";
import type { Db } from "../db/database.ts";
import { accounts, loginKeys } from "../db/schema.ts";
import type { Auth } from "./better-auth.ts";

export type Enrolment = {
  accountId: string;
  companyId: string;
  role: "owner" | "admin" | "member";
  loginPublicKey: Uint8Array;
  accountSalt: Uint8Array;
  at: number;
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const enrol = async (
  db: Db,
  auth: Auth,
  account: Enrolment,
  alongside: (tx: Tx) => void = () => {},
) => {
  const context = await auth.$context;
  const user = await context.internalAdapter
    .createUser({
      id: account.accountId,
      name: "",
      email: `${account.accountId}@accounts.kennwort.invalid`,
      emailVerified: false,
      companyId: account.companyId,
    })
    .catch(() => undefined);
  if (!user) return undefined;
  db.transaction((tx) => {
    alongside(tx);
    tx.insert(accounts)
      .values({
        id: user.id,
        companyId: account.companyId,
        role: account.role,
        createdAt: account.at,
      })
      .run();
    tx.insert(loginKeys)
      .values({
        accountId: user.id,
        publicKey: encodeBytes(account.loginPublicKey),
        accountSalt: encodeBytes(account.accountSalt),
        createdAt: account.at,
      })
      .run();
  });
  return { id: user.id, session: () => context.internalAdapter.createSession(user.id) };
};

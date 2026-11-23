/** Who hears of an event (K-602): read from what the server stores anyway, by account ID */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/database.ts";
import { accounts } from "../db/schema.ts";

type Role = "owner" | "admin" | "member";

/** The company's accounts still in, all of them or those with one of the roles */
export const companyAccounts = (
  db: Db,
  companyId: string,
  roles: readonly Role[] = ["owner", "admin", "member"],
) =>
  db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.companyId, companyId),
        inArray(accounts.role, [...roles]),
        isNull(accounts.leftAt),
      ),
    )
    .all()
    .map((row) => row.id);

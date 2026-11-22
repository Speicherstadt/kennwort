import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import type { ListedGrant, Statement } from "@kennwort/core";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "../session/session.ts";
import { phaseOf, renewEmergency, waitingRequests } from "./emergency.ts";

// K-307 part d: where a grant stands, by what the server lists
const statement = (at: number) => ({ at }) as Statement;
const listed = (changes: Partial<ListedGrant> = {}) =>
  ({ request: null, objection: null, approval: null, releaseAt: null, ...changes }) as ListedGrant;

describe("phaseOf", () => {
  it("follows a grant from no request to waiting, objected or released", () => {
    expect(phaseOf(listed(), 10)).toBe("idle");
    const asked = listed({ request: statement(5), releaseAt: 20 });
    expect(phaseOf(asked, 19)).toBe("waiting");
    expect(phaseOf(asked, 20)).toBe("released");
    expect(phaseOf({ ...asked, approval: statement(5) }, 6)).toBe("released");
    expect(phaseOf({ ...asked, objection: statement(5) }, 30)).toBe("objected");
    expect(phaseOf({ ...asked, releaseAt: null }, 30)).toBe("waiting");
  });

  it("names the waiting requests for the grantor's notice", () => {
    const waiting = listed({ request: statement(5), releaseAt: 20 });
    expect(waitingRequests([listed(), waiting, { ...waiting, releaseAt: 9 }], 10)).toEqual([
      waiting,
    ]);
  });
});

describe("renewEmergency", () => {
  it("asks nothing while locked or when the list does not load", async () => {
    const emergencyList = vi.fn(async () => undefined);
    const api = { emergencyList } as never;
    const locked = { opened: () => undefined } as unknown as Session;
    expect(await renewEmergency(api, locked, {} as Loaded)).toBe(0);
    expect(emergencyList).not.toHaveBeenCalled();
    const open = { opened: () => ({ token: "tok" }) } as unknown as Session;
    expect(await renewEmergency(api, open, {} as Loaded)).toBe(0);
    expect(emergencyList).toHaveBeenCalledWith("tok");
  });
});

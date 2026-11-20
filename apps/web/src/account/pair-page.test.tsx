import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Navigation } from "../navigation.ts";
import { answerPairing, type NewDevicePairing } from "../pairing/pairing.ts";
import type { PollAnswer } from "../session/pairing-api.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession, type Session } from "../session/session.ts";
import { type PairDeps, PairPage } from "./pair-page.tsx";

// K-303 part 5 (P-04), the new device's page against a scripted server (review of K-303)
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const unlockedOwner = async () => {
  const api = fakeApi();
  const owner = createSession({ api, storage: memory(), derive });
  const made = await owner.setUp("richtiger-code", PASSPHRASE);
  const opened = owner.opened();
  if (!made.ok || !opened) throw new Error("setup");
  return { api, opened, secretKey: made.value.secretKey };
};

/** A server that answers "waiting" until the owner answered, then follows `script`, then 404 */
const pagedServer = async (
  script: (answer: () => Promise<Uint8Array>) => Promise<(PollAnswer | undefined)[]>,
) => {
  const { api, opened, secretKey } = await unlockedOwner();
  let publicKey: Uint8Array | undefined;
  let made: Uint8Array | undefined;
  let answers: (PollAnswer | undefined)[] | undefined;
  const stand = {
    pairingKey: async () => publicKey,
    answerPairing: async (_t: string, _i: string, pkg: Uint8Array) => {
      made = pkg;
      return true;
    },
    keys: () => api.keys("signed-in-0"),
  };
  const server = {
    keys: () => api.keys("signed-in-0"),
    announcePairing: async (key: Uint8Array) => {
      publicKey = key;
      return { id: "p1", pollToken: "t1" };
    },
    cancelPairing: async () => true,
    pollPairing: async () => (answers ? answers.shift() : { state: "waiting" }),
    pairingKey: stand.pairingKey,
    answerPairing: stand.answerPairing,
    confirmPairing: async () => true,
  } as unknown as PairDeps;
  return {
    server,
    /** Once the page announced, the owner answers from the link the page shows */
    ready: async (link: NewDevicePairing["link"]) => {
      const answer = async () => {
        const result = await answerPairing(stand, opened, secretKey, link);
        if (!result.ok || !made) throw new Error("answer");
        return made;
      };
      answers = await script(answer);
    },
  };
};

const linkFrom = (root: ParentNode) => {
  const text = root.querySelector("[data-testid=pairing-link]")?.textContent ?? "";
  const params = new URLSearchParams(text.slice(text.indexOf("#") + 1));
  return params;
};

const mount = (server: PairDeps) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const nav = { go: vi.fn(), replace: vi.fn() } as unknown as Navigation;
  const session = { adopt: vi.fn() } as unknown as Session;
  dispose = render(() => <PairPage nav={nav} session={session} api={server} pollMs={10} />, root);
  return { root, nav, session };
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flush();
  }
};
const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;
const alert = (root: ParentNode) => root.querySelector("[role=alert]")?.textContent;

const shownLink = async (root: ParentNode) => {
  await until(() => linkFrom(root).get("r") !== null);
  const { readPairingLink } = await import("../pairing/link.ts");
  const params = linkFrom(root);
  const link = readPairingLink(`#${params}`);
  if (!link) throw new Error("no link");
  return link;
};

describe("the new device's pairing page", () => {
  it("still joins when the other device confirms before this one agrees", async () => {
    const paged = await pagedServer(async (answer) => {
      const pkg = await answer();
      // The confirmation comes before the user here agrees; the server then forgets the pairing
      return [{ state: "confirmed", package: pkg, token: "signed-in-0" }];
    });
    const { root, nav, session } = mount(paged.server);
    await paged.ready(await shownLink(root));
    await until(() => !!root.querySelector("[data-testid=pairing-code]"));
    // A few more polls run out (404) while the user compares the codes
    await new Promise((r) => setTimeout(r, 80));
    flush();
    expect(alert(root)).toBeUndefined();
    button(root, "Code stimmt").click();
    await until(() => (nav.replace as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(session.adopt).toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/entries");
  });

  it("does not join with a package other than the one whose code the user agreed to", async () => {
    const paged = await pagedServer(async (answer) => {
      const first = await answer();
      const second = await answer();
      return [
        ...Array.from({ length: 5 }, () => ({ state: "package", package: first }) as const),
        { state: "confirmed", package: second, token: "signed-in-0" },
      ];
    });
    const { root, nav, session } = mount(paged.server);
    await paged.ready(await shownLink(root));
    await until(() => !!root.querySelector("[data-testid=pairing-code]"));
    button(root, "Code stimmt").click();
    await until(
      () => !!alert(root) || (nav.replace as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    );
    await new Promise((r) => setTimeout(r, 50));
    flush();
    expect(alert(root)).toBe("Das Verbinden hat nicht geklappt. Starte es neu.");
    expect(session.adopt).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

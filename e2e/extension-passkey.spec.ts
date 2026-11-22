import {
  type BrowserContext,
  expect,
  type Frame,
  type Page,
  type Route,
  test,
} from "@playwright/test";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { newDevice, PASSPHRASE, setUpCompany } from "./account.ts";
import { addEntry } from "./entries.ts";
import { extensionWorker, launchExtension, openPopup } from "./extension.ts";

// K-406: Kennwort as a passkey provider, in a real Chromium with the extension loaded, against a
// test relying party under .test that checks every registration and sign-in with SimpleWebAuthn's
// server (MasterKale/SimpleWebAuthn), here in the test process. Jonas saves a passkey for the portal
// and signs in with it, each after his click in the prompt; a look-alike domain that claims the
// portal's rpId gets SecurityError, a cross-origin frame, a sandboxed frame on the portal's own
// address, a locked Kennwort and "Anderes Gerät verwenden" go to the browser's own WebAuthn (a
// virtual authenticator over CDP), a covered prompt signs nothing, and the prompt shows the same
// whether or not a passkey fits, so the page cannot probe for them.
const SERVER = "http://localhost:5176";
const RP_ID = "weber-haustechnik.test";
const PORTAL = `https://portal.${RP_ID}`;
const LOOK_ALIKE = "https://portal-weber-haustechnik.test";
const FOREIGN = "https://login.anderer-anbieter.test";
const HIDDEN = "Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts signiert.";

/**
 * The relying party's page: two buttons that run a ceremony against its server and write the
 * outcome into #status. Options and results go as JSON (WebAuthn Level 3, toJSON()), the options
 * converted by hand so the page needs no library.
 */
const rpPage = (
  title: string,
  claim = "",
) => `<!doctype html><html lang="de"><meta charset="utf-8"><title>${title}</title>
<body style="margin:16px"><h1>${title}</h1>
<button id="register">Registrieren</button> <button id="login">Anmelden</button>
<p id="status">bereit</p>
<script>
const bytes = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const say = (text) => { document.getElementById("status").textContent = text; };
const post = (path, body) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());
const ids = (list) => (list ?? []).map((c) => ({ ...c, id: bytes(c.id) }));
const claim = ${JSON.stringify(claim)};
document.getElementById("register").addEventListener("click", async () => {
  say("läuft");
  try {
    const o = await post("/register/options");
    const publicKey = { ...o, challenge: bytes(o.challenge), user: { ...o.user, id: bytes(o.user.id) },
      excludeCredentials: ids(o.excludeCredentials), rp: claim ? { ...o.rp, id: claim } : o.rp };
    const credential = await navigator.credentials.create({ publicKey });
    const result = await post("/register/verify", credential.toJSON());
    say(result.verified ? "registriert " + result.deviceType : "abgelehnt " + result.error);
  } catch (error) { say("Fehler " + error.name); }
});
document.getElementById("login").addEventListener("click", async () => {
  say("läuft");
  try {
    const o = await post("/login/options");
    const publicKey = { ...o, challenge: bytes(o.challenge), allowCredentials: ids(o.allowCredentials) };
    const credential = await navigator.credentials.get({ publicKey });
    const result = await post("/login/verify", credential.toJSON());
    say(result.verified ? "angemeldet " + result.deviceType : "abgelehnt " + result.error);
  } catch (error) { say("Fehler " + error.name); }
});
</script></body>`;

/** The portal with the sign-in page of another company in an iframe that may use WebAuthn */
const framedPage = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Portal mit Fremd-Login</title>
<body style="margin:16px"><h1>Portal</h1>
<iframe title="Fremd-Login" src="${FOREIGN}/passkey" style="width:340px;height:200px"
  allow="publickey-credentials-create; publickey-credentials-get"></iframe></body>`;

/** One relying party per origin: its users' passkeys and the challenge it expects next */
const relyingParty = (origin: string) => {
  const rpID = new URL(origin).hostname.endsWith(RP_ID) ? RP_ID : new URL(origin).hostname;
  const credentials: WebAuthnCredential[] = [];
  let challenge = "";
  const json = (route: Route, body: unknown) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  return async (route: Route, path: string) => {
    const body = route.request().postDataJSON();
    if (path === "/register/options") {
      const options = await generateRegistrationOptions({
        rpName: "Weber Portal",
        rpID,
        userName: "jonas.weber",
        userDisplayName: "Jonas Weber",
        attestationType: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        supportedAlgorithmIDs: [-7],
      });
      challenge = options.challenge;
      return json(route, options);
    }
    if (path === "/login/options") {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: credentials.map((c) => ({ id: c.id })),
      });
      challenge = options.challenge;
      return json(route, options);
    }
    try {
      if (path === "/register/verify") {
        const verified = await verifyRegistrationResponse({
          response: body,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });
        if (verified.registrationInfo) credentials.push(verified.registrationInfo.credential);
        return json(route, {
          verified: verified.verified,
          deviceType: verified.registrationInfo?.credentialDeviceType,
        });
      }
      const credential = credentials.find((c) => c.id === body.id);
      if (!credential) return json(route, { verified: false, error: "unbekannt" });
      const verified = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential,
      });
      return json(route, {
        verified: verified.verified,
        deviceType: verified.authenticationInfo.credentialDeviceType,
      });
    } catch (error) {
      return json(route, { verified: false, error: (error as Error).message });
    }
  };
};

/**
 * An upload on the portal's own address, which the portal shows as sites show untrusted files: in
 * a sandboxed iframe, so it runs in an opaque origin. Its script asks for an assertion for the
 * portal's rpId with a challenge of its own; the browser refuses that, and so must Kennwort
 */
const UPLOAD = `${PORTAL}/uploads/anhang.html`;
const upload = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Anhang</title>
<body><button id="login">Öffnen</button><p id="status">bereit</p>
<script>
document.getElementById("login").addEventListener("click", async () => {
  document.getElementById("status").textContent = "läuft";
  try {
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: new Uint8Array(32), rpId: ${JSON.stringify(RP_ID)}, userVerification: "required",
      timeout: 15000 } });
    document.getElementById("status").textContent = "signiert " + credential.id;
  } catch (error) { document.getElementById("status").textContent = "Fehler " + error.name; }
});
</script></body>`;
const preview = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Vorschau</title>
<body style="margin:16px"><h1>Vorschau</h1>
<iframe title="Anhang" sandbox="allow-scripts" src="${UPLOAD}" style="width:340px;height:200px"
  allow="publickey-credentials-get"></iframe></body>`;

/**
 * A page of the portal that probes for passkeys: one sign-in that allows any of the portal's
 * passkeys, one that allows only an ID Kennwort does not hold (as a site would try the IDs of
 * other accounts), each with a challenge of its own
 */
const probePage = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Probe</title>
<body style="margin:16px"><h1>Probe</h1>
<button id="known">Bekannt</button> <button id="unknown">Unbekannt</button><p id="status">bereit</p>
<script>
const run = async (allowCredentials) => {
  document.getElementById("status").textContent = "läuft";
  try {
    await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32),
      rpId: ${JSON.stringify(RP_ID)}, allowCredentials, timeout: 5000 } });
    document.getElementById("status").textContent = "angemeldet";
  } catch (error) { document.getElementById("status").textContent = "Fehler " + error.name; }
};
document.getElementById("known").addEventListener("click", () => run([]));
document.getElementById("unknown").addEventListener("click", () =>
  run([{ type: "public-key", id: new Uint8Array(16).fill(7) }]));
</script></body>`;

const PAGES: Record<string, string> = {
  [`${PORTAL}/passkey`]: rpPage("Weber Portal"),
  [`${PORTAL}/framed`]: framedPage,
  [`${PORTAL}/vorschau`]: preview,
  [UPLOAD]: upload,
  [`${PORTAL}/probe`]: probePage,
  [`${FOREIGN}/passkey`]: rpPage("Fremd-Login"),
  [`${LOOK_ALIKE}/passkey`]: rpPage("Portal", RP_ID),
};

const isPrompt = (frame: Frame) =>
  frame.url().startsWith("chrome-extension://") && frame.url().includes("/src/prompt/prompt.html");

/** The passkey prompt once it shows and takes clicks */
const armedPrompt = async (page: Page, title: string) => {
  await expect.poll(() => page.frames().some(isPrompt), { timeout: 20_000 }).toBe(true);
  const frame = page.frames().find(isPrompt) as Frame;
  await expect(frame.getByText(title)).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator("main")).toHaveAttribute("data-armed", "true");
  return frame;
};

/** Whether the page ever showed the prompt frame (it starts hidden; see the init script below) */
const everShown = (page: Page) =>
  page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown === true);

const status = (page: Page | Frame) => page.locator("#status");

type Area = { get(keys: null | string): Promise<Record<string, unknown>> };
type Chrome = { storage: { session: Area; local: Area } };

const connect = async (context: BrowserContext, accountId: string, secretKey: string) => {
  const popup = await openPopup(context);
  await popup.getByLabel("Server", { exact: true }).fill(SERVER);
  await popup.getByLabel("Konto-ID", { exact: true }).fill(accountId);
  await popup.getByLabel("Secret Key", { exact: true }).fill(secretKey);
  await popup.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await popup.getByRole("button", { name: "Verbinden und entsperren" }).click();
  await expect(popup.getByRole("searchbox")).toBeVisible({ timeout: 30_000 });
  return popup;
};

test.describe
  .serial("the passkey provider", () => {
    test.describe.configure({ timeout: 90_000 });
    let context: BrowserContext;
    let close = async () => {};
    let tab: Page;
    let accountId = "";
    let secretKey = "";

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      const web = await newDevice(browser);
      const owner = await setUpCompany(web);
      // The first entry opens the vault the passkey goes into
      await addEntry(web, {
        title: "Großhandel Portal",
        username: "jonas.weber",
        password: "Kupfer-Rohr-18!",
        website: `${PORTAL}/login`,
      });
      await web.context().close();
      ({ accountId } = JSON.parse(owner.device) as { accountId: string });
      secretKey = owner.secretKey;

      ({ context, close } = await launchExtension("de-DE", "light", "e2e"));
      const parties = new Map<string, ReturnType<typeof relyingParty>>();
      await context.route("https://*.test/**", (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "POST") {
          const party = parties.get(url.origin) ?? relyingParty(url.origin);
          parties.set(url.origin, party);
          return party(route, url.pathname);
        }
        const body = PAGES[`${url.origin}${url.pathname}`];
        return body
          ? route.fulfill({ contentType: "text/html", body })
          : route.fulfill({ status: 404, body: "" });
      });
      await context.addInitScript(() => {
        new MutationObserver(() => {
          const host = document.querySelector("kennwort-save") as HTMLElement | null;
          if (host?.style.display === "block")
            (window as unknown as { promptShown: boolean }).promptShown = true;
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["style"],
        });
      });
      await (await connect(context, accountId, secretKey)).close();
      tab = context.pages()[0] ?? (await context.newPage());
      // The browser's own WebAuthn: a virtual platform authenticator, which keeps its passkeys
      // on this one device (singleDevice), unlike Kennwort's synced ones (multiDevice)
      const cdp = await context.newCDPSession(tab);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
    });

    test.afterAll(() => close());

    test("saves a passkey after a click in the prompt, and signs in with it", async () => {
      await tab.goto(`${PORTAL}/passkey`);
      await tab.getByRole("button", { name: "Registrieren" }).click();
      const prompt = await armedPrompt(tab, "Passkey in Kennwort speichern?");
      await expect(prompt.locator("header")).toContainText("portal.weber-haustechnik.test");
      await expect(prompt.getByText(`für ${RP_ID}`)).toBeVisible();
      await expect(prompt.getByText("jonas.weber")).toBeVisible();
      // Nothing is answered before the click
      await expect(status(tab)).toHaveText("läuft");
      // The page sees neither the prompt's content nor its frame
      expect(
        await tab.evaluate(() => [
          document.querySelector("kennwort-save")?.shadowRoot ?? null,
          document.querySelectorAll("iframe").length,
        ]),
      ).toEqual([null, 0]);
      await prompt.getByRole("button", { name: "Passkey speichern" }).click();
      // Checked by SimpleWebAuthn: attestation none, a synced passkey of Kennwort
      await expect(status(tab)).toHaveText("registriert multiDevice", { timeout: 30_000 });
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);

      await tab.getByRole("button", { name: "Anmelden" }).click();
      const signIn = await armedPrompt(tab, "Mit Passkey anmelden?");
      await signIn.getByRole("button", { name: "Anmelden als jonas.weber" }).click();
      await expect(status(tab)).toHaveText("angemeldet multiDevice", { timeout: 30_000 });
    });

    test("keeps the passkey as an encrypted entry and nothing of it in a storage area", async () => {
      const popup = await openPopup(context);
      await popup.getByRole("searchbox").fill("Weber Portal");
      await expect(popup.getByRole("listitem")).toHaveText([/Weber Portal/], { timeout: 30_000 });
      await popup.close();
      const areas = await (await extensionWorker(context)).evaluate(async () => {
        const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
        return {
          session: JSON.stringify(await chrome.storage.session.get(null)),
          local: await chrome.storage.local.get(null),
        };
      });
      expect(areas.local).toEqual({});
      expect(areas.session).not.toContain("private-key");
      expect(areas.session).not.toContain(RP_ID);
    });

    test("serves no sandboxed frame on the portal's address, whose origin is opaque", async () => {
      await tab.goto(`${PORTAL}/vorschau`);
      const frame = tab.frameLocator('iframe[title="Anhang"]');
      await frame.getByRole("button", { name: "Öffnen" }).click();
      await expect(frame.locator("#status")).toHaveText(/^Fehler /, { timeout: 30_000 });
      expect(await everShown(tab)).toBe(false);
    });

    test("lets a page not tell from the prompt whether Kennwort holds a passkey it allows", async () => {
      await tab.goto(`${PORTAL}/probe`);
      // What a page can read of the prompt: whether it shows, and its size
      const size = () =>
        tab.evaluate(() => {
          const box = document.querySelector("kennwort-save")?.getBoundingClientRect();
          return box && [box.width, box.height];
        });
      await tab.getByRole("button", { name: "Unbekannt" }).click();
      const none = await armedPrompt(tab, "Mit Passkey anmelden?");
      const noneSize = await size();
      await none.getByRole("button", { name: "Anderes Gerät verwenden" }).click();
      await expect(status(tab)).toHaveText(/^Fehler /, { timeout: 30_000 });
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);

      await tab.getByRole("button", { name: "Bekannt", exact: true }).click();
      const known = await armedPrompt(tab, "Mit Passkey anmelden?");
      await expect(known.getByRole("button", { name: "Anmelden als jonas.weber" })).toBeVisible();
      expect(await size()).toEqual(noneSize);
      await known.getByRole("button", { name: "Schließen" }).click();
      await expect(status(tab)).toHaveText("Fehler NotAllowedError", { timeout: 10_000 });
    });

    test("refuses a look-alike domain that claims the portal's rpId, without a prompt", async () => {
      await tab.goto(`${LOOK_ALIKE}/passkey`);
      await tab.getByRole("button", { name: "Registrieren" }).click();
      await expect(status(tab)).toHaveText("Fehler SecurityError", { timeout: 10_000 });
      expect(await everShown(tab)).toBe(false);
    });

    test("leaves a cross-origin frame to the browser's own WebAuthn", async () => {
      await tab.goto(`${PORTAL}/framed`);
      const frame = tab.frameLocator('iframe[title="Fremd-Login"]');
      await frame.getByRole("button", { name: "Registrieren" }).click();
      await expect(frame.locator("#status")).toHaveText("registriert singleDevice", {
        timeout: 30_000,
      });
      expect(await everShown(tab)).toBe(false);
    });

    test("hands a ceremony to the browser on „Anderes Gerät verwenden“", async () => {
      await tab.goto(`${PORTAL}/passkey`);
      await tab.getByRole("button", { name: "Registrieren" }).click();
      const prompt = await armedPrompt(tab, "Passkey in Kennwort speichern?");
      await prompt.getByRole("button", { name: "Anderes Gerät verwenden" }).click();
      await expect(status(tab)).toHaveText("registriert singleDevice", { timeout: 30_000 });
    });

    test("signs nothing while the prompt is covered", async () => {
      await tab.goto(`${PORTAL}/passkey`);
      await tab.getByRole("button", { name: "Anmelden" }).click();
      const prompt = await armedPrompt(tab, "Mit Passkey anmelden?");
      const button = prompt.getByRole("button", { name: "Anmelden als jonas.weber" });
      const box = await button.boundingBox();
      if (!box) throw new Error("the button has no box");
      // A cover in the top layer that the page keeps putting back on top, letting clicks through
      await tab.evaluate(() => {
        const host = document.querySelector("kennwort-save")?.getBoundingClientRect();
        if (!host) throw new Error("no prompt");
        const cover = document.createElement("div");
        cover.popover = "manual";
        cover.textContent = "Alles in Ordnung";
        cover.style.cssText = `position:fixed;inset:auto;margin:0;border:0;padding:0;
          background:#fff;pointer-events:none;left:${host.left}px;top:${host.top}px;
          width:${host.width}px;height:${host.height}px`;
        document.body.append(cover);
        cover.showPopover();
        (window as unknown as { fight: number }).fight = window.setInterval(() => {
          cover.hidePopover();
          cover.showPopover();
        }, 50);
      });
      await expect(prompt.locator("main")).toHaveAttribute("data-armed", "false");
      await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(prompt.getByRole("alert")).toHaveText(HIDDEN);
      await expect(status(tab)).toHaveText("läuft");
      // × ends the ceremony without a credential
      await tab.evaluate(() => clearInterval((window as unknown as { fight: number }).fight));
      await tab.evaluate(() => document.querySelector("[popover]:not(kennwort-save)")?.remove());
      await expect(prompt.locator("main")).toHaveAttribute("data-armed", "true", {
        timeout: 10_000,
      });
      await prompt.getByRole("button", { name: "Schließen" }).click();
      await expect(status(tab)).toHaveText("Fehler NotAllowedError", { timeout: 10_000 });
    });

    test("hands the ceremony to the browser while Kennwort is locked, unseen", async () => {
      const popup = await openPopup(context);
      await popup.getByRole("button", { name: "Sperren", exact: true }).click();
      await expect(popup.getByRole("heading", { level: 1 })).toHaveText("Kennwort ist gesperrt");
      await popup.close();
      await tab.goto(`${PORTAL}/passkey`);
      await tab.getByRole("button", { name: "Registrieren" }).click();
      await expect(status(tab)).toHaveText("registriert singleDevice", { timeout: 30_000 });
      expect(await everShown(tab)).toBe(false);
    });
  });

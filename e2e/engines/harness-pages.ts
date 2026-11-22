/**
 * The test pages of the fill harness (apps/extension/harness/engine-harness.ts, K-407): a login
 * page with a frame of its own origin and one of another origin (127.0.0.1 instead of localhost),
 * a page whose password field is hidden, and a stand-in for the menu page, which the harness
 * frames where the extension would frame its own (the menu's entries are not under test here, its
 * frame is).
 */
const page = (title: string, body: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px sans-serif;margin:24px}input{display:block;margin:8px 0;width:240px}iframe{width:420px;height:260px;border:1px solid #888}</style>
</head><body>${body}<script type="module" src="/harness/page.js"></script></body></html>`;

const loginForm = (id: string) =>
  `<form id="${id}" action="#"><label>Benutzername <input name="username" autocomplete="username"></label>
<label>Passwort <input name="password" type="password" autocomplete="current-password"></label>
<button>Anmelden</button></form>`;

export const HARNESS_HTML: Record<string, string> = {
  "/harness/top.html": page(
    "Portal",
    `<h1>Portal</h1>${loginForm("login")}
<iframe id="same" title="Gleiche Herkunft" src="/harness/frame.html"></iframe>
<iframe id="foreign" title="Fremde Herkunft" src="http://127.0.0.1:5178/harness/frame.html"></iframe>`,
  ),
  "/harness/frame.html": page("Rahmen", loginForm("login")),
  "/harness/hidden.html": page(
    "Verstecktes Feld",
    `<form id="login" action="#"><label>Benutzername <input name="username" autocomplete="username"></label>
<input name="password" type="password" style="position:absolute;left:-9999px" tabindex="-1" aria-hidden="true">
<button>Weiter</button></form>`,
  ),
  "/harness/menu.html": `<!doctype html><html lang="de"><title>Menü</title><body>Menü</body></html>`,
};

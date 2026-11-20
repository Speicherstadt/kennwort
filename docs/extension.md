---
title: Browser-Extension
description: >-
  Die Browser-Extension von Kennwort für Chrome, Edge und Firefox: was sie heute kann, wo sie
  entsperrte Schlüssel ablegt und wie man sie zum Entwickeln entpackt lädt.
---

# Browser-Extension

Die Extension bringt Kennwort in den Browser: Zugänge für die Seite finden, auf Klick ausfüllen,
neue Logins speichern und vor Phishing warnen. Ihre Oberfläche ist dieselbe wie die der Web-App
(`packages/ui`), mit denselben Texten auf Deutsch und Englisch.

!!! warning "Erst das Gerüst"
    Die Extension lässt sich bauen und laden, kann aber noch nichts entsperren. Das Popup zeigt
    den gesperrten Zustand; „Mit Passkey entsperren“ und „Passphrase verwenden“ sagen nur, dass
    das Entsperren mit einer der nächsten Versionen kommt. Entsperren, Treffer für die Seite und
    Ausfüllen folgen Schritt für Schritt (siehe [Projektplan](plan.md)).

## Browser

| Browser | Build | Hinweis |
| --- | --- | --- |
| Chrome, Edge | `apps/extension/dist/chrome` | Manifest V3 mit Service Worker |
| Firefox (ab 140) | `apps/extension/dist/firefox` | Manifest V3 mit Hintergrundskript und fester Extension-ID |

Safari und Firefox für Android kommen später mit eigenen Tests.

Die Extension fragt nur nach der Berechtigung `storage`. Zugriff auf Websites braucht sie erst
zum Ausfüllen, und das kann sie noch nicht. Ihre Seiten laufen unter einer strengen Content Security
Policy: Es läuft nur Code, der in der Extension selbst steckt, nichts aus dem Netz.

## Wo die Schlüssel liegen

Entsperrte Schlüssel liegen nur in `chrome.storage.session`: im Arbeitsspeicher des Browsers, weg,
sobald der Browser schließt, und für Skripte auf Websites nicht erreichbar. Die Extension legt
nichts in einem Speicher ab, der auf die Festplatte geht – weder `chrome.storage.local` noch
`chrome.storage.sync`, `localStorage` oder IndexedDB. Ein Test schlägt fehl, sobald ihr Code einen
davon benutzt, und jeder Build prüft das fertige Bundle samt der Pakete, die es einbindet. Sprache
sowie Hell und Dunkel folgen darum Browser und System; eine eigene Wahl merkt sich die Extension
nicht.

## Entpackt laden

Zum Entwickeln baust du die Extension und lädst den Ordner direkt in den Browser:

```sh
bun install
bun run --cwd apps/extension build:chrome    # oder build:firefox, oder build für beide
```

- **Chrome, Edge**: `chrome://extensions` (Edge: `edge://extensions`) öffnen, den
  Entwicklermodus einschalten, **Entpackte Erweiterung laden** und `apps/extension/dist/chrome`
  wählen.
- **Firefox**: `about:debugging#/runtime/this-firefox` öffnen, **Temporäres Add-on laden** und
  die Datei `apps/extension/dist/firefox/manifest.json` wählen. Firefox entfernt das Add-on beim
  nächsten Neustart wieder.

Nach einer Änderung baust du neu und lädst die Extension im Browser neu.

Name, Beschreibung und der Text des Knopfs in der Symbolleiste stehen in
`apps/extension/public/_locales`, weil Browser und Stores sie selbst lesen. Alle anderen Texte
kommen wie in der Web-App aus `messages/de.json` und `messages/en.json`, übersetzt von einer
eigenen Paraglide-Laufzeit ohne `localStorage` (`apps/extension/paraglide`, erzeugt von
`bun run i18n`, das `bun install` schon aufruft); die Sprache folgt dem Browser.

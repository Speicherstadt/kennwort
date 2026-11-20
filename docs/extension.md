---
title: Browser-Extension
description: >-
  Die Browser-Extension von Kennwort für Chrome, Edge und Firefox: verbinden und entsperren, Treffer
  für die Seite, Suche, Favoriten und Generator im Popup, wo sie entsperrte Schlüssel ablegt und wie
  man sie zum Entwickeln entpackt lädt.
---

# Browser-Extension

Die Extension bringt Kennwort in den Browser: Zugänge für die Seite finden, auf Klick ausfüllen,
neue Logins speichern und vor Phishing warnen. Ihre Oberfläche ist dieselbe wie die der Web-App
(`packages/ui`), mit denselben Texten auf Deutsch und Englisch.

!!! info "Popup ohne Ausfüllen"
    Das Popup entsperrt, zeigt die Einträge für die offene Seite, sucht, filtert Favoriten, kopiert
    Benutzername und Passwort und erzeugt Passwörter. Ausfüllen auf der Seite, Speichern neuer
    Logins und die Phishing-Warnung folgen Schritt für Schritt (siehe [Projektplan](plan.md)).

## Browser

| Browser | Build | Hinweis |
| --- | --- | --- |
| Chrome, Edge | `apps/extension/dist/chrome` | Manifest V3 mit Service Worker |
| Firefox (ab 140) | `apps/extension/dist/firefox` | Manifest V3 mit Hintergrundskript und fester Extension-ID |

Safari und Firefox für Android kommen später mit eigenen Tests.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| `storage` | nur `chrome.storage.session` für die entsperrten Schlüssel (unten) |
| `alarms` | das automatische Sperren, auch wenn das Popup zu ist |
| `activeTab` | die Adresse des Tabs, über dem du das Popup öffnest – erst nach deinem Klick auf das Symbol und nur für diesen Tab |

Zugriff auf Websites braucht die Extension erst zum Ausfüllen. Ihre Seiten laufen unter einer
strengen Content Security Policy: Es läuft nur Code, der in der Extension selbst steckt, nichts aus
dem Netz.

## Verbinden und entsperren

Beim ersten Öffnen fragt das Popup nach dem **Server** deiner Firma (die Adresse der Web-App), deiner
**Konto-ID** und deinem **Secret Key** – alle drei stehen auf deinem Recovery-Kit – und nach deiner
**Passphrase**. Entsperrt wird genau wie in der Web-App: Die Extension meldet sich mit dem
Anmelde-Schlüssel aus Passphrase und Secret Key an, lädt die Geheimtexte und öffnet sie auf dem Gerät
(siehe [Sicherheitsdesign](sicherheitsdesign.md#p-03-entsperren)). Die Passphrase verlässt das
Gerät nie und wird nirgends abgelegt.

Der Server muss über HTTPS erreichbar sein; nur `localhost` geht zum Entwickeln auch ohne. Er
beantwortet Anfragen der Extension mit CORS-Kopfzeilen, nur für deren Herkunft
(`chrome-extension://…`, `moz-extension://…`), nur für `/api` und die Anmeldung mit dem
Anmelde-Schlüssel und ohne Cookies: Jede Anfrage trägt ihr Sitzungs-Token selbst.

Server, Konto-ID und Secret Key merkt sich die Extension, bis du den Browser schließt; danach fragt
sie wieder danach. Die Web-App merkt sich Konto-ID und Secret Key im `localStorage`, die Extension
hat keinen Speicher auf der Festplatte (unten). Mit **Anderes Konto** vergisst sie alle drei sofort.
Entsperren mit Passkey kommt, sobald es das in Kennwort gibt; bis dahin ist die Passphrase der Weg.

## Das Popup

- **Für <Host>**: die Einträge, deren Website genau zum Host der offenen Seite passt. Genau heißt:
  `portal.weber-haustechnik.test` passt zu einem Eintrag für `portal.weber-haustechnik.test`, aber
  nicht zu `weber-haustechnik.test`, `www.portal.weber-haustechnik.test` oder einer ähnlich
  aussehenden Domain. Schema, Port, Pfad und Groß- und Kleinschreibung zählen nicht. Bis das
  Ausfüllen kommt, vergleicht die Extension selbst, ohne Public Suffix List; die genaue Regel fürs
  Ausfüllen mit `tldts` bringt der nächste Schritt.
- **Suche** über Titel, Art, Tags und alle nicht geheimen Felder, wie in der Web-App; Passwörter,
  frühere Passwörter und TOTP-Schlüssel durchsucht sie nie.
- **Alle** oder **Favoriten**.
- **Kopieren**: Benutzername und Passwort je mit einem eigenen Knopf. Das Passwort erscheint im Popup
  nie im Klartext. Ausgefüllt wird nichts.
- **Generator** unten, derselbe wie in der Web-App; seine Einstellungen merkt sich die Extension
  nicht.
- **Sperren** oben rechts; die Fußzeile nennt die Sperrzeit und verlinkt die Web-App.

Was das Popup zeigt, lädt es mit demselben Code wie die Web-App (`packages/client`): Jedes Log ist
gegen den gemerkten Firmen-Schlüssel geprüft, jeder Eintrag gegen sein Log. Einträge, die jemand
einzeln mit dir geteilt hat („Mit mir geteilt“), zeigt das Popup noch nicht.

## Wo die Schlüssel liegen

Entsperrte Schlüssel liegen nur in `chrome.storage.session`: im Arbeitsspeicher des Browsers, weg,
sobald der Browser schließt, und für Skripte auf Websites nicht erreichbar. Dort liegen zwei Dinge:

| Eintrag | Inhalt | Weg |
| --- | --- | --- |
| `kennwort-keys` | Account Key und Sitzungs-Token | beim Sperren, nach der Sperrzeit und beim Schließen des Browsers |
| `kennwort-device` | Server, Konto-ID, Secret Key und die Geräte-ID für die Geräteliste | bei „Anderes Konto“ und beim Schließen des Browsers |
| `kennwort-state` | der Kontozustand, wie die Extension ihn zuletzt gesehen oder geschrieben hat, verschlüsselt unter dem Account Key | bei „Anderes Konto“ und beim Schließen des Browsers |

Öffnest du das Popup wieder, öffnet der Account Key den Schlüsselblock und den Kontozustand neu aus den
Geheimtexten des Servers und führt den gemerkten Kontozustand hinein: Spielt der Server einen älteren
zurück, vergisst die Extension nicht, was sie schon geprüft hat. Entschlüsselte Einträge leben nur im
Popup und sind weg, wenn es zugeht.

**Automatisches Sperren**: Nach der Sperrzeit der Firma (sonst zehn Minuten) ohne Klick oder
Tastendruck im Popup sperrt die Extension. Weil das Popup meist zu ist, ist die Sperrzeit ein Alarm
des Browsers: Klingelt er, löscht der Service Worker die Schlüssel. Findet ein Popup Schlüssel ohne
laufenden Alarm, sperrt es ebenfalls.

Die Extension legt nichts in einem Speicher ab, der auf die Festplatte geht – weder
`chrome.storage.local` noch `chrome.storage.sync`, `localStorage` oder IndexedDB. Ein Test schlägt
fehl, sobald ihr Code einen davon benutzt, und jeder Build prüft das fertige Bundle samt der Pakete,
die es einbindet. Sprache sowie Hell und Dunkel folgen darum Browser und System; eine eigene Wahl
merkt sich die Extension nicht.

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

Für die End-to-End-Tests baut `bun run --cwd apps/extension build:e2e` nach `dist/e2e` eine Fassung,
die zusätzlich die Adressen der Testseiten unter `.test` lesen darf: `activeTab` gibt die Adresse
nur nach einem echten Klick auf das Symbol frei, und den kann Playwright nicht machen. Ein Release
trägt diese Berechtigung nie.

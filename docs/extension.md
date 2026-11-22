---
title: Browser-Extension
description: >-
  Die Browser-Extension von Kennwort für Chrome, Edge und Firefox: verbinden und entsperren, Treffer
  für die Seite, Suche, Favoriten und Generator im Popup, Ausfüllen über das Inline-Menü, neue und
  geänderte Logins speichern, vor Phishing warnen, Passkeys für Websites anlegen und damit anmelden,
  wo sie entsperrte Schlüssel ablegt und wie man sie zum Entwickeln entpackt lädt.
---

# Browser-Extension

Die Extension bringt Kennwort in den Browser: Zugänge für die Seite finden, auf Klick ausfüllen,
neue Logins speichern, vor Phishing warnen und Passkeys für Websites halten. Ihre Oberfläche ist dieselbe wie die der Web-App
(`packages/ui`), mit denselben Texten auf Deutsch und Englisch.

!!! info "Was schon geht"
    Das Popup entsperrt, zeigt die Einträge für die offene Seite, sucht, filtert Favoriten, kopiert
    Benutzername und Passwort und erzeugt Passwörter. Das Inline-Menü unter einem Login-Feld füllt
    auf Klick oder Enter aus. Nach dem Anmelden bietet die Extension an, ein neues Login zu speichern
    oder ein geändertes Passwort zu aktualisieren. Tippst du ein gespeichertes Passwort auf einer
    anderen Seite ein als der, für die es gespeichert ist, warnt sie dich. Will eine Website einen
    Passkey anlegen oder damit anmelden, bietet Kennwort an, ihn zu speichern oder zu benutzen.

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
| `webNavigation` | die Frames eines Tabs und ihre Adressen, damit die Extension beim Ausfüllen selbst prüft, in welchen Frame ein Passwort geht (unten) |
| Content Script auf allen `http`- und `https`-Seiten | das Inline-Menü unter Login-Feldern, das Angebot zum Speichern nach dem Anmelden, die Phishing-Warnung und die Passkeys (dafür auch ein kleines Skript im Kontext der Seite selbst, vor deren Skripten); der Browser nennt das beim Installieren „alle Daten auf allen Websites lesen und ändern“ |

Ihre Seiten laufen unter einer strengen Content Security Policy: Es läuft nur Code, der in der
Extension selbst steckt, nichts aus dem Netz. Websites dürfen nur zwei Seiten der Extension laden:
die des Inline-Menüs und die der Leiste, in der das Speichern und die Phishing-Warnung erscheinen.

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
  aussehenden Domain. Schema, Port, Pfad und Groß- und Kleinschreibung zählen nicht. Den Host liest
  die Extension mit `tldts` gegen die Public Suffix List, wie beim Ausfüllen: Ein öffentliches
  Suffix wie `co.uk` oder `github.io` gilt nie als eine Website.
- **Suche** über Titel, Art, Tags und alle nicht geheimen Felder, wie in der Web-App; Passwörter,
  frühere Passwörter und TOTP-Schlüssel durchsucht sie nie.
- **Alle** oder **Favoriten**.
- **Kopieren**: Benutzername und Passwort je mit einem eigenen Knopf. Das Passwort erscheint im Popup
  nie im Klartext. Ausgefüllt wird im Inline-Menü (unten), nicht im Popup.
- **Generator** unten, derselbe wie in der Web-App; seine Einstellungen merkt sich die Extension
  nicht.
- **Sperren** oben rechts; die Fußzeile nennt die Sperrzeit und verlinkt die Web-App.

Was das Popup zeigt, lädt es mit demselben Code wie die Web-App (`packages/client`): Jedes Log ist
gegen den gemerkten Firmen-Schlüssel geprüft, jeder Eintrag gegen sein Log. Einträge, die jemand
einzeln mit dir geteilt hat („Mit mir geteilt“), zeigt das Popup noch nicht.

## Inline-Menü und Ausfüllen

Klickst du in ein Feld für Benutzername oder Passwort, legt die Extension ein kleines Menü darunter:
oben das Logo und der Host der Seite, darunter die Einträge, deren Website genau zu diesem Host
passt (dieselbe Regel wie im Popup), unten die Tasten. Ein Klick auf einen Eintrag oder ↓ im Feld,
dann ↑↓ und Enter füllt Benutzername und Passwort ein; Esc oder ein Klick daneben schließt das Menü.
Ist Kennwort gesperrt, bietet das Menü **Zum Entsperren öffnen** an und öffnet das Popup; danach
zeigt es die Einträge von selbst.

Was die Extension dabei sicherstellt:

- **Nur auf deinen Klick**: Nichts wird beim Laden einer Seite ausgefüllt, und ein Klick oder
  Tastendruck, den ein Skript der Seite vortäuscht, zählt nicht.
- **Nur auf dem exakten Host**: Eine Seite wie `portal-weber-haustechnik.test` bekommt für
  `portal.weber-haustechnik.test` keine Treffer und nichts ausgefüllt. Kurz vor dem Ausfüllen prüft
  die Extension die Adresse noch einmal; ein für `https` gespeichertes Passwort geht nie in eine
  Seite, die über `http` kommt.
- **Nie in fremde Frames**: Ein Login-Formular in einem iFrame einer anderen Website, etwa Werbung
  oder ein eingebettetes Fremd-Formular, bekommt kein Menü und keine Daten, auch nicht auf einer
  passenden Seite. Gefüllt wird nur die Seite selbst oder ein Frame derselben Herkunft.
- **Die Seite sieht nicht hinein**: Das Menü ist eine Seite der Extension in einem geschlossenen
  Shadow DOM; die Website kann weder die Einträge lesen noch das Menü selbst einbetten.
- **Kein verdecktes Menü**: Liegt etwas über dem Menü oder ist es durchsichtig gemacht, füllt ein
  Klick nichts aus, und das Menü sagt: „Das Menü war verdeckt oder durchsichtig.“ So kann eine
  Seite dich nicht in ein unsichtbares Menü klicken lassen (Clickjacking).
- **Nur in Felder, die du siehst**: Versteckt eine Seite ein Passwortfeld hinter einem
  Benutzernamen-Feld (außerhalb der Seite, durchsichtig, winzig oder ausgeblendet), schreibt die
  Extension dort nichts hinein, sondern nur in die Felder, die die Seite zeigt.
- **Die Sperrzeit läuft weiter**: Das Menü schiebt das automatische Sperren nicht hinaus; nur das
  Popup tut das.

In Firefox kann die Extension noch nicht prüfen, ob das Menü sichtbar ist (dafür fehlt
IntersectionObserver v2); dort zeigt das Menü die Einträge, füllt aber nicht aus und verweist aufs
Kopieren im Popup. Wie die Prüfungen genau laufen, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-17-ausfullen).

## Logins speichern und aktualisieren

Meldest du dich auf einer Seite an, merkt die Extension das und fragt oben rechts in einer kleinen
Leiste nach:

- **Login speichern?** – für die Seite gibt es noch keinen Eintrag mit diesem Benutzernamen.
  **Speichern** legt einen Eintrag an: Titel und Website sind die Adresse der Seite, dazu
  Benutzername und Passwort. Darfst du in mehrere Tresore schreiben, wählst du vorher den Tresor.
- **Passwort aktualisieren?** – es gibt einen Eintrag mit diesem Benutzernamen, aber einem anderen
  Passwort, etwa nach „Passwort ändern“ auf der Seite. **Aktualisieren** schreibt das neue Passwort
  in den Eintrag; das alte steht danach unter **Frühere Passwörter**, wie nach einer Änderung in der
  Web-App. Ein Formular zum Passwort-Ändern ohne Benutzernamen erkennt die Extension am bisherigen
  Passwort.
- **Nichts**, wenn Benutzername und Passwort schon so gespeichert sind.
- **Nie für diese Seite** – die Extension fragt auf diesem Host nie wieder. Die Liste dieser Seiten
  steht verschlüsselt in deinem Kontozustand, gilt also auf allen Geräten deines Kontos und liegt
  nirgends auf der Festplatte. Herausnehmen kann man eine Seite noch nicht.
- **Schließen** (×) – diesmal nicht.

Ist Kennwort gesperrt, zeigt die Leiste **Entsperren und speichern** und öffnet das Popup; nach dem
Entsperren bietet sie an, was passt. Welche Einträge passen, entscheidet dieselbe Regel wie im Popup
und beim Ausfüllen: genau der Host der Seite. Einen Eintrag in einem Tresor, den du nur lesen
darfst, ändert die Leiste nicht, und in einem Tresor, in dem ein Schlüsselwechsel aussteht, speichert
niemand etwas, bis ein Verwalter ihn gemacht hat.

Was die Extension dabei sicherstellt:

- **Nur, was du selbst abschickst**: Gezählt wird ein Absenden direkt nach einem echten Klick oder
  Tastendruck von dir in das Login-Formular oder auf seinen Knopf, nicht ein Formular, das ein Skript
  der Seite selbst abschickt, auch nicht, wenn du gerade etwas anderes angeklickt hast. Neben dem
  normalen Absenden zählt ein Klick auf den Knopf eines Login-Formulars und Enter in einem Login-Feld
  ohne Formular, für Seiten, die per Skript anmelden.
- **Nur aus Feldern, die du siehst**: Ein Passwortfeld, das die Seite versteckt, liest die Extension
  nie; so kann eine Seite kein Passwort unterschieben, das du nie eingegeben hast.
- **Nur in der Seite selbst oder einem Frame derselben Herkunft**, wie beim Ausfüllen; die Adresse
  nimmt der Service Worker aus dem Frame-Baum des Browsers, nicht von der Seite.
- **Das Passwort bleibt kurz und flüchtig**: Das Content Script gibt es sofort an den Service
  Worker weiter und behält nichts. Der hält es nur im Arbeitsspeicher, nie in einem
  Speicherbereich des Browsers, bietet es einmal der Seite an, die nach der Anmeldung im selben Tab
  geladen ist, und gibt es einmal an die Leiste; danach hat er es nicht mehr. Nicht abgeholt,
  vergisst er es nach einer Minute.
- **Die Seite sieht nicht hinein**: Die Leiste ist wie das Inline-Menü eine Seite der Extension in
  einem geschlossenen Shadow DOM. Sie öffnet sich zuerst unsichtbar, vergleicht mit deinen Einträgen
  und erscheint nur, wenn es etwas anzubieten gibt.
- **Keine verdeckte Leiste**: Speichern, Aktualisieren und „Nie für diese Seite“ zählen nur, wenn
  die Leiste sichtbar, nicht abgedeckt und nicht durchsichtig ist, mit denselben Prüfungen wie beim
  Inline-Menü. Sonst sagt sie: „Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts
  gespeichert.“
- **Gespeichert wird wie in der Web-App**: Verschlüsselt, signiert und an Eintrag, Tresor und
  Version gebunden, über denselben Code (`packages/client`).

Wann ist die Anmeldung fertig? Lädt die Seite danach eine neue Seite, fragt die Extension dort.
Bleibt die Seite (Anmeldung per Skript), fragt sie, sobald das abgeschickte Passwortfeld
verschwindet oder ausgeblendet wird; bleibt es stehen, gilt das als fehlgeschlagene Anmeldung, und
die Extension fragt nicht. Meldest du dich in einem Frame derselben Herkunft an, fragt sie erst,
wenn die Seite drumherum neu lädt. In Firefox kann die Leiste wie das Menü nicht prüfen, ob sie
sichtbar ist; dort speichert sie nicht und verweist auf die Web-App.

## Phishing-Warnung

Tippst du das gespeicherte Passwort eines Eintrags auf einer Seite ein, die nicht genau zu seiner
Website passt – etwa `portal-weber-haustechnik.test` statt `portal.weber-haustechnik.test` –, warnt
die Extension, sobald du das Feld verlässt, Enter drückst oder das Formular abschickst. Oben rechts
erscheint die Leiste mit **Ist das wirklich portal.weber-haustechnik.test?**, dem Eintrag, zu dem das
Passwort gehört, und dem Host der Seite, auf der du gerade bist:

- **Passwort ändern** öffnet die Seite zum Passwort-Ändern der echten Website
  (`/.well-known/change-password`). Hast du das Passwort schon abgeschickt, ändere es dort.
- **Eintrag öffnen** zeigt den Eintrag in der Web-App.
- **Das ist nicht … – trotzdem fortfahren** schließt die Warnung, etwa wenn du dasselbe Passwort
  bewusst auch hier benutzt. Auf derselben Seite warnt die Extension für dieses Passwort danach
  nicht noch einmal, bis du sie sperrst.

Die Warnung sperrt die Seite nicht; du kannst weiter tippen und klicken. Sie kommt nicht, wenn die
Seite genau die Website eines Eintrags mit diesem Passwort ist (dieselbe Regel wie beim Ausfüllen),
bei einem Passwort, das Kennwort nicht kennt, und solange Kennwort gesperrt ist. Auf einer Seite,
deren Host selbst eine öffentliche Endung ist, etwa ein Bucket unter `s3.amazonaws.com`, warnt sie
immer: Für einen solchen Host kann kein Eintrag gespeichert sein.

Was die Extension dabei sicherstellt:

- **Kein Passwort wandert im Klartext**: Solange Kennwort entsperrt ist, hält die Extension zu jedem
  gespeicherten Passwort mit Website nur einen kurzen, gesalzenen, langsam berechneten Hash von vier
  Byte (Argon2id) und Hashes der Hosts, im Arbeitsspeicher des Browsers (`chrome.storage.session`).
  Das Content Script in der Seite kennt keine gespeicherten Passwörter; es berechnet denselben kurzen
  Hash aus dem, was du getippt hast, und gibt nur ihn an den Service Worker weiter, nie den Wert und
  nie bei jedem Tastendruck. An den Server geht nichts davon.
- **Nur, was du selbst tippst**: Gezählt wird nur ein Wert, den du eingetippt oder eingefügt hast,
  in einem Feld, das die Seite zeigt. Setzt eine Seite selbst einen Wert ins Feld, auch über
  `execCommand`, oder ändert sie ihn, nachdem du getippt hast, prüft die Extension nichts; so kann
  eine Seite nicht ausprobieren, welche Passwörter du gespeichert hast.
- **Nur entsperrt**: Beim Sperren, nach der Sperrzeit und beim Schließen des Browsers verschwinden
  die Hashes mit den Schlüsseln. Sie entstehen neu, sobald Popup, Inline-Menü oder Leiste die
  Einträge laden, jedes Mal mit einem neuen Salt.
- **Die Seite deckt sie nicht zu**: Die Warnung ist wie die Leiste zum Speichern eine Seite der
  Extension in einem geschlossenen Shadow DOM. Legt die Seite etwas über sie, blendet sie aus oder
  macht sie durchsichtig, holt die Extension sie nach spätestens einer Viertelsekunde wieder nach
  oben. „Trotzdem fortfahren“ zählt nur, wenn die Warnung sichtbar, nicht abgedeckt und nicht
  durchsichtig ist, mit denselben Prüfungen wie das Speichern; sonst sagt sie: „Die Warnung war
  verdeckt oder durchsichtig.“

Wie in der Leiste zum Speichern kann Firefox nicht bestätigen, dass die Warnung sichtbar ist; dort
bleibt sie stehen, bis du die Seite verlässt. Wie die Hashes genau gebildet werden und was sie
verraten, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-17-ausfullen).

## Passkeys

Will eine Website einen Passkey anlegen („Mit Passkey registrieren“) oder dich damit anmelden,
fragt Kennwort oben rechts in derselben Leiste wie beim Speichern:

- **Passkey in Kennwort speichern?** – mit der Website (`für weber-haustechnik.test`) und deinem
  Benutzernamen dort. **Passkey speichern** legt einen Eintrag der Art „Passkey“ an; darfst du in
  mehrere Tresore schreiben, wählst du vorher den Tresor. Liegt für dieses Konto schon ein Passkey
  in Kennwort, sagt die Leiste das.
- **Mit Passkey anmelden?** – je Passkey für genau diese Website ein Knopf **Anmelden als …**.
- **Anderes Gerät verwenden** gibt an das Fenster des Browsers ab: einen Passkey auf dem Gerät
  selbst, einem Handy oder einem Sicherheitsschlüssel.
- **Schließen** (×) bricht ab; die Website erfährt nur, dass es nicht geklappt hat.

Ist Kennwort gesperrt oder liegt kein passender Passkey darin, erscheint die Leiste nicht, und der
Browser fragt wie ohne Kennwort. Ein Passkey ist ein Eintrag wie jeder andere: verschlüsselt,
synchronisiert auf alle deine Geräte und mit allen teilbar, die den Tresor lesen. Er hat keine
Adresse, darum bietet ihn weder das Popup unter „Für <Host>“ noch das Inline-Menü zum Ausfüllen an;
die Suche findet ihn. Neu anlegen lässt er sich nur von der Website aus.

Was die Extension dabei sicherstellt:

- **Nur nach deinem Klick**: Speichern und Anmelden zählen nur mit denselben Prüfungen wie das
  Speichern eines Logins – Klick vom Browser zugestellt, Leiste sichtbar, nicht abgedeckt und nicht
  durchsichtig. Sonst sagt sie: „Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts
  signiert.“ Die Website bekommt erst eine Antwort, wenn du geklickt hast.
- **Nur für die richtige Website**: Eine Seite darf einen Passkey nur für ihren eigenen Host oder
  eine übergeordnete Domain anlegen und benutzen, die kein öffentliches Suffix ist –
  `portal.weber-haustechnik.test` für `weber-haustechnik.test`, aber nie
  `portal-weber-haustechnik.test` für `weber-haustechnik.test`, nie `co.uk` oder `github.io`.
  Prüft wird mit `tldts` gegen die Public Suffix List, wie beim Ausfüllen, und mit der Adresse des
  Frames aus dem Frame-Baum des Browsers, nicht mit dem, was die Seite behauptet.
- **Nie in fremden Frames**: Bedient wird nur die Seite selbst oder ein Frame derselben Herkunft.
  Will ein eingebettetes Fremd-Formular einen Passkey, fragt der Browser selbst und prüft dabei,
  ob die Seite es mit `allow="publickey-credentials-get"` (oder `-create`) erlaubt hat.
- **Die Seite sieht nicht hinein**: Ein kleines Skript im Kontext der Seite stellt sich vor
  `navigator.credentials` und reicht die Anfrage an das Content Script weiter; es kennt keine
  Passkeys und entscheidet nichts. Die Website erfährt nur, was du bestätigt hast: den neuen Passkey
  oder die Anmeldung. Ob es in Kennwort einen Passkey für sie gibt, erfährt sie nicht.
- **Der Schlüssel bleibt im Eintrag**: Der private Schlüssel (ES256 auf P-256, Format F-12) liegt
  nur verschlüsselt im Eintrag und zum Signieren kurz im Arbeitsspeicher der Leiste, nie im Service
  Worker, im Content Script, in der Seite oder in einem Speicherbereich des Browsers.
- **Kein Zähler**: Wie bei den Passkeys von Apple, Google und Bitwarden bleibt der Zähler 0, weil
  ein Passkey auf mehreren Geräten liegt. Ein Anmelden ändert den Eintrag darum nicht, auch Leser
  eines Tresors melden sich an.

Nicht von Kennwort, sondern vom Browser beantwortet werden außerdem Passkeys im Autofill-Menü der
Seite (`mediation: "conditional"`), Seiten ohne HTTPS (außer `localhost`) und Websites, die kein
ES256 annehmen. In Firefox kann die Leiste wie beim Speichern nicht prüfen, ob sie sichtbar ist; dort
signiert sie nicht und verweist auf ein anderes Gerät. Wie die Prüfungen genau laufen, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-17-ausfullen).

## Wo die Schlüssel liegen

Entsperrte Schlüssel liegen nur in `chrome.storage.session`: im Arbeitsspeicher des Browsers, weg,
sobald der Browser schließt, und für Skripte auf Websites nicht erreichbar. Dort liegt Folgendes:

| Eintrag | Inhalt | Weg |
| --- | --- | --- |
| `kennwort-keys` | Account Key und Sitzungs-Token | beim Sperren, nach der Sperrzeit und beim Schließen des Browsers |
| `kennwort-device` | Server, Konto-ID, Secret Key und die Geräte-ID für die Geräteliste | bei „Anderes Konto“ und beim Schließen des Browsers |
| `kennwort-state` | der Kontozustand, wie die Extension ihn zuletzt gesehen oder geschrieben hat, verschlüsselt unter dem Account Key | bei „Anderes Konto“ und beim Schließen des Browsers |
| `kennwort-alert` | für die Phishing-Warnung je Passwort ein Hash von vier Byte und Hashes seiner Hosts, unter einem Salt je Entsperren; kein Passwort und kein Host im Klartext | beim Sperren, nach der Sperrzeit und beim Schließen des Browsers |

Öffnest du das Popup wieder, öffnet der Account Key den Schlüsselblock und den Kontozustand neu aus den
Geheimtexten des Servers und führt den gemerkten Kontozustand hinein: Spielt der Server einen älteren
zurück, vergisst die Extension nicht, was sie schon geprüft hat. Entschlüsselte Einträge leben nur im
Popup, im Inline-Menü und in der Leiste zum Speichern und sind weg, wenn diese zugehen.

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
trägt diese Berechtigung nie. Die Tests des Inline-Menüs (`e2e/extension-fill.spec.ts`) füllen auf
Testseiten aus und spielen die Angriffe nach: Phishing-Domain, fremdes iFrame, verdecktes und
durchsichtiges Menü. Die Tests zum Speichern (`e2e/extension-save.spec.ts`) melden sich auf
Testseiten an, speichern und aktualisieren und prüfen, dass dasselbe Passwort, ein verstecktes
Passwortfeld, ein Absenden per Skript, eine Seite auf der Liste „Nie für diese Seite“ und eine
verdeckte Leiste nichts speichern. Die Tests der Phishing-Warnung (`e2e/extension-alert.spec.ts`)
tippen das Passwort des Portals auf einer ähnlich aussehenden Domain ein und prüfen, dass die
Warnung kommt und sich nicht zudecken lässt, aber nicht auf dem Portal selbst, nicht bei einem
anderen Passwort, einem versteckten Feld, einem Wert, den die Seite selbst setzt (auch über
`execCommand`) oder nach dem Tippen austauscht, und nicht gesperrt; auf einer Seite unter
`s3.amazonaws.com` kommt sie. Die Tests der Passkeys (`e2e/extension-passkey.spec.ts`) legen auf
einer Testseite, die mit dem Server von SimpleWebAuthn prüft, einen Passkey an und melden sich damit
an; eine ähnlich aussehende Domain, die die rpId des Portals beansprucht, bekommt `SecurityError`,
ein fremdes iFrame, „Anderes Gerät verwenden“ und ein gesperrtes Kennwort gehen an einen virtuellen
Authenticator des Browsers, und eine verdeckte Leiste signiert nichts.

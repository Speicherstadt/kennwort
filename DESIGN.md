# Design

Wie Kennwort aussieht und sich bedient, für Menschen und Agenten. Vorbild ist das Mockup „Kennwort
Mockup“ (Web-App, Extension-Popup gesperrt und entsperrt, Inline-Menü, Handy mit Liste und Eintrag)
und der Look von Kontext: ruhig, kompakt, Zinc-Grautöne, Geist. Eine neue Regel kommt im selben
Pull Request hierher wie die Änderung, die sie braucht.

## Grundsätze

- **Ruhig und dicht**: viel Information auf wenig Platz, aber nie gedrängt; keine Verläufe, keine
  Schatten außer bei schwebenden Elementen (Menüs, Dialoge, Inline-Menü).
- **Vertrauen zeigen, nicht behaupten**: Ein Hinweis wie „Mitgliedschaft signiert · Kette geprüft“
  steht nur da, wo der Client es wirklich geprüft hat. Grün heißt geprüft, sonst nichts.
- **Geheimnisse sind verdeckt**: Passwörter erscheinen als Punkte, bis jemand sie aufdeckt; Kopieren
  und Aufdecken sind eigene Knöpfe mit `aria-label`.
- **Eine Hauptaktion je Ansicht**, dunkel gefüllt; alles andere umrandet oder als Icon-Knopf.

## Farben

Tailwind 4 mit Zinc als Grundpalette; alle Werte als CSS-Variablen, hell und dunkel.

| Token | Hell | Dunkel | Wofür |
| --- | --- | --- | --- |
| `--background` | `#ffffff` | `#09090b` | Fläche |
| `--muted` | `#fafafa` | `#18181b` | Rail, Seitenleiste, Fußzeilen |
| `--accent` | `#f4f4f5` | `#27272a` | gewählte Zeile, Suchfeld am Handy |
| `--border` | `#e4e4e7` | `#27272a` | Linien, Rahmen |
| `--foreground` | `#09090b` | `#fafafa` | Text |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | Nebentext, Beschriftungen (mindestens 4,5:1) |
| `--primary` | `#18181b` | `#fafafa` | Hauptknopf, Logo-Fläche |
| `--primary-foreground` | `#fafafa` | `#18181b` | Text auf `--primary` |
| `--success` | `#15803d` | `#4ade80` | „geprüft“, starke Passwörter |
| `--warning` | `#b45309` | `#fbbf24` | „Zum Ändern“, Hinweise |
| `--warning-surface` | `#fef3c7` | `#422006` | Badge „ändern“ |
| `--danger` | `#b91c1c` | `#f87171` | Löschen, Fehler, Phishing-Warnung |

Nebentext auf `--accent` (gewählte Zeile, aktiver Tab) steht in `--foreground`: `--muted-foreground`
erreicht dort nur 4,4:1 statt 4,5:1. Flächen für Gruppen wie die Tab-Leiste sind `--muted`.

Farben, die man unterscheiden muss, unterscheiden sich auch in der Helligkeit. Kein Rot/Grün als
einziges Merkmal: dazu immer Text oder Icon.

## Schrift und Maße

- **Geist** für Text, **Geist Mono** für Passwörter, Einmalcodes, Hosts und Tastenkürzel; selbst
  ausgeliefert, nicht von Google Fonts.
- Größen: 11 px Abschnittstitel (Großbuchstaben, `letter-spacing: .04em`), 12 px Nebentext, 13 px
  Text am Desktop, 15 px Text am Handy, 17–18 px Titel der Detailansicht, 28 px Titel am Handy;
  Einmalcode 18 px (Desktop) bzw. 22 px (Handy) in Geist Mono.
- Abstände im 4-px-Raster; Zeilen in Listen 8 px innen, Karten 12–14 px innen.
- Radien: 6 px Knöpfe und Zeilen, 7–8 px Eingabefelder und Icons, 10–12 px Karten und Menüs,
  rund für Avatare und Filter-Chips.
- Icons: lucide (die Daten aus `lucide`, gezeichnet von `Icon` in `packages/ui`, weil `lucide-solid` Solid 1 braucht), 16 px am Desktop, 18–22 px am Handy, Strich 2; neue Icons kommen über `@kennwort/ui/icons`.

## Aufbau

**Desktop (ab `md`, 768 px)**: Rail (56 px) mit Logo, Bereichen und Avatar · Seitenleiste (232 px,
ab `lg`) mit Firma, „Alle Einträge“, „Favoriten“, „Zum Ändern“, „Mit mir geteilt“ (sobald jemand
etwas geteilt hat), Tresoren und Gruppen, unten der
Hinweis zur Verschlüsselung · Liste (340 px) mit Titel, Suche (`/`) und Einträgen · Detail mit
Kopfzeile (Icon, Titel, Tresor, letzte Änderung, Teilen, Bearbeiten), Feldkarte und rechts Zugriff
und Verlauf.

**Handy (unter `md`)**: ein Screen zur Zeit, über die URL gewählt; großer Titel, Suchfeld, Filter-Chips
(„Alle“, „Favoriten“, „Zum Ändern · 3“, „Mit mir geteilt“ wie in der Seitenleiste), Liste mit
40-px-Icons; Eintrag mit Zurück-Link, großem Icon, Feldkarte; unten Tab-Leiste (Einträge,
Generator, Gruppen, Einstellungen). Berührungsziele mindestens 44 px.

**Extension-Popup (360 × 600)**: Kopf mit Logo und Sperren, Suche, Filter-Chips „Alle“ und
„Favoriten“, „Für <Host>“ mit Treffern (Kopieren von Benutzername und Passwort als Icon-Knöpfe; ausgefüllt
wird im Inline-Menü), darunter alle Einträge, Fußzeile mit „Generator“, Sperrzeit und Link zur
Web-App. Gesperrt: Schloss, „Kennwort ist gesperrt“, der Server darunter in Geist Mono, die
Passphrase mit dem Hauptknopf „Entsperren“, Link „Anderes Konto“; „Mit Passkey entsperren“ wird der
Hauptknopf, sobald es Entsperren per Passkey gibt. Noch nicht verbunden: „Mit Kennwort verbinden“
mit Server, Konto-ID, Secret Key und Passphrase.

**Inline-Menü**: schwebt unter dem Feld (über ihm, wenn unten kein Platz ist), 320 px breit, Radius
12 px mit Schatten; Kopf mit Logo und Host in Geist Mono, Treffer mit Titel und Benutzername, mit
Tastatur wählbar (↓ im Feld, dann ↑↓, Enter, Esc), Fußzeile mit Tastenhinweis („Neues Login“ ab
K-404). Gesperrt: „Kennwort ist gesperrt“ und der Hauptknopf „Zum Entsperren öffnen“. Ein
verweigertes Ausfüllen nennt den Grund in Rot über der Liste. Es ist ein iFrame der Extension in
einem geschlossenen Shadow DOM.

**Speichern-Leiste** (Extension, nach einer Anmeldung): schwebt oben rechts in der Seite, 360 px
breit, Radius 12 px mit Schatten, wie das Inline-Menü ein iFrame der Extension in einem
geschlossenen Shadow DOM. Kopf mit Logo, „Kennwort“, dem Host in Geist Mono und × zum Schließen;
darunter „Login speichern?“ oder „Passwort aktualisieren?“ mit dem Titel des Eintrags, dem
Benutzernamen (nie dem Passwort), bei mehreren beschreibbaren Tresoren die Wahl des Tresors, der
Hauptknopf „Speichern“ oder „Aktualisieren“ und daneben „Nie für diese Seite“ als Ghost-Knopf.
Gesperrt: „Kennwort ist gesperrt“ und der Hauptknopf „Entsperren und speichern“. Danach kurz
„Gespeichert.“, dann schließt sie sich; ein verweigertes Speichern nennt den Grund in Rot.

**Phishing-Warnung** (Extension, beim Eintippen eines gespeicherten Passworts auf fremder Domain):
dieselbe Leiste oben rechts, mit Rahmen in `--danger`, sperrt die Seite nicht. Kopf wie dort mit dem
Host der Seite; darunter ein Schild-Icon und „Ist das wirklich <Host>?“ in `--danger`, ein Satz mit
dem Titel des Eintrags, seinem Host und dem der Seite, der Hauptknopf „Passwort ändern“ (gefüllt in
`--danger`, öffnet `/.well-known/change-password` der echten Website), der Link „Eintrag öffnen“ und
als Ghost-Knopf „Das ist nicht <Host> – trotzdem fortfahren“. Ein verdeckter Klick nennt den Grund in
Rot.

**Passkey-Leiste** (Extension, wenn eine Website einen Passkey anlegen oder damit anmelden will):
dieselbe Leiste oben rechts. Kopf wie dort mit dem Host der Seite; darunter „Passkey in Kennwort
speichern?“ oder „Mit Passkey anmelden?“, klein „für <rpId>“, beim Speichern der Benutzername und bei
mehreren beschreibbaren Tresoren die Wahl des Tresors mit dem Hauptknopf „Passkey speichern“, beim
Anmelden je passendem Passkey ein Hauptknopf „Anmelden als <Name>“; immer „Anderes Gerät verwenden“
als Ghost-Knopf. Ohne passenden Passkey sagt sie das klein in Grau, über „Anderes Gerät verwenden“.
Immer gleich hoch (232 px), was nicht passt, rollt: Die Seite sieht die Größe des Frames. Gesperrt
erscheint sie nicht, der Browser fragt selbst.
Ein verdeckter Klick nennt den Grund in Rot.

## Komponenten

Eigene Komponenten in `packages/ui`, ohne Bibliothek, auf nativen Elementen:

| Komponente | Grundlage | Hinweise |
| --- | --- | --- |
| Button | `<button>` | Varianten `primary`, `outline`, `ghost`, `icon`; Icon-Knöpfe immer mit `aria-label` |
| Eingabe, Suche | `<input>` mit `<label>` | Suche mit Lupe und Kürzel |
| Dialog | `<dialog>` mit `showModal()` | Fokusfalle und Esc vom Browser |
| Menü, Popover, Tooltip | Popover-API, CSS Anchor Positioning | Tastatur selbst: Pfeile, Home/End, Esc |
| Combobox | `<input>` + Popover | Rolle `combobox`, `aria-activedescendant` |
| Toast | eigener Bereich mit `aria-live="polite"` | verschwindet nicht, solange Fokus darin ist |
| Badge | `<span>` | „ändern“ in Warnfarbe, Zähler grau |
| Geheimnisfeld | Text + Aufdecken + Kopieren | Punkte in Geist Mono, Stärke als vier Balken |
| Einmalcode | Geist Mono + Kreis-Countdown | Countdown mit `aria-label` „noch N Sekunden“ |

`cn()` setzt Klassen zusammen, `variants()` wählt Varianten typisiert; Konflikte vermeiden
Komponenten über `data-*`-Attribute statt durch Überschreiben von Klassen.

## Texte

- Du-Form, kurz, ohne Fachwörter: „Ausfüllen“, „Zum Ändern“, „Zugriff anfragen“, „Kennwort ist
  gesperrt“.
- Sicherheitsbegriffe nur, wo sie helfen, und dann erklärt: „Ende-zu-Ende-verschlüsselt“ ja,
  „AAD“ nie in der Oberfläche.
- Jeder Text in `messages/de.json` und `messages/en.json`, Datum und Zahlen über `Intl`.

## Testdaten

Die Firma „Weber Haustechnik“ mit Jonas, Anna, Sandra und Max; Tresore Persönlich, Büro,
Buchhaltung, Kunden-Zugänge, Baustellen-Tablets; Gruppen info@ und rechnung@; Adressen unter
`weber-haustechnik.test`, Websites unter `.test`.

---
title: Kommandozeile
description: >-
  kennwort, die Kommandozeile von Kennwort: einen Rechner mit dem Konto verbinden, Einträge nach
  Titel, Benutzername und Adresse suchen und ein Passwort oder einen Einmal-Code erst nach
  Bestätigung ausgeben; entsperrt wird je Befehl, nichts bleibt entsperrt.
---

# Kommandozeile

`kennwort` bringt Kennwort ins Terminal: einen Rechner mit deinem Konto verbinden, Einträge suchen
und ein Feld eines Eintrags ausgeben, für dich am Terminal oder für ein Skript. Sie entsperrt mit
demselben Code wie Web-App und Extension (`packages/client`) und prüft alles, was der Server
liefert, genauso: das Protokoll jedes Tresors unter dem Firmenschlüssel, jeden Eintrag gegen
Eintrag, Tresor und Version. Was die Prüfung nicht besteht, zeigt sie nicht und warnt auf stderr.

## Bauen

```sh
bun run --cwd apps/cli build      # dist/kennwort, eine Datei ohne Abhängigkeiten
```

`bun run build` baut sie mit allen anderen Teilen. Die Datei ist ein mit `bun build --compile`
gebautes Programm für das System, auf dem sie gebaut wurde.

## Befehle

| Befehl | Was er tut |
| --- | --- |
| `kennwort login` | Verbindet diesen Rechner mit deinem Konto: Server, Konto-ID, Secret Key und Passphrase. Erst wenn Anmelden, Entsperren und die Prüfung klappen, merkt sich der Rechner das Konto |
| `kennwort search <Suche>` | Sucht nach Titel, Benutzername und Adresse und gibt je Treffer Titel, Benutzername, Adresse, Tresor und ID aus, durch Tabs getrennt |
| `kennwort get <Eintrag>` | Gibt ein Feld eines Eintrags aus, erst nachdem du am Terminal mit `j` bestätigt hast (oder mit `--yes`) |
| `kennwort unlock` | Prüft Passphrase und Server und sagt, wie viele Tresore und Einträge es gibt; danach bleibt nichts entsperrt |
| `kennwort lock` | Hat nichts zu tun, weil zwischen zwei Befehlen nichts entsperrt bleibt; für Skripte, die es aufrufen |
| `kennwort logout` | Der Rechner vergisst das Konto |
| `kennwort --help` | Zeigt alle Befehle und Optionen |

`get` nimmt einen Eintrag nur über seine ID (aus `search`) oder seinen ganzen Titel, ohne Rücksicht
auf Groß- und Kleinschreibung und Akzente, und rät nie aus einem Teil. Heißen zwei Einträge gleich,
nennt `get` beide mit ihrer ID.

### Optionen

| Option | Befehl | Bedeutung |
| --- | --- | --- |
| `--server <URL>` | `login` | Adresse des Servers, sonst fragt `login` danach. Nur `https://`, `http://` nur für `localhost` |
| `--account <ID>` | `login` | Konto-ID aus dem Wiederherstellungs-Kit, sonst fragt `login` danach |
| `--field <Feld>` | `get` | Welches Feld, über seine ID (`password`, `username`, `website`, `totp`, …) oder seinen Namen; ohne die Option das Passwort, sonst das erste geheime Feld |
| `-y`, `--yes` | `get` | Ohne Rückfrage ausgeben, für Skripte |
| `--passphrase-stdin` | `login`, `unlock`, `search`, `get` | Die Passphrase aus der ersten Zeile von stdin statt vom Terminal; ist stdin selbst das Terminal, fragt `kennwort` trotzdem ohne Echo |

Für ein Feld mit Einmal-Codes (TOTP) gibt `get` den Code von jetzt aus, nie den Schlüssel.

### Rückgabewerte

| Wert | Bedeutung |
| --- | --- |
| 0 | erledigt |
| 1 | Fehler: falsche Passphrase, Server antwortet nicht, Prüfung gescheitert, kein Konto verbunden, kein Terminal |
| 2 | falscher Aufruf: unbekannter Befehl, unbekannte Option, fehlendes Argument |
| 3 | nicht bestätigt oder abgebrochen (Strg-C) |
| 4 | nicht gefunden: keine Treffer, kein solcher Eintrag, zwei mit demselben Titel, kein solches Feld |

## Beispiel

```console
$ kennwort login --server https://kennwort.weber-haustechnik.de
Konto-ID: 3q2-7wAAAAAAAAAAAAAAAA
Secret Key:
Passphrase:
Angemeldet bei https://kennwort.weber-haustechnik.de. Tresore: 2, Einträge: 41.

$ kennwort search datev
Passphrase:
DATEV Unternehmen online	jonas@weber-haustechnik.de	https://www.datev.de	Büro	Jd8…

$ kennwort get "DATEV Unternehmen online"
Passphrase:
„Passwort“ von „DATEV Unternehmen online“ ausgeben? [j/N] j
…
```

## Sprache

Die Texte sind die der App (Deutsch und Englisch). Die Sprache kommt aus `LC_ALL`, `LC_MESSAGES`
oder `LANG`, in dieser Reihenfolge: Deutsch, wo sie mit `de` beginnt, sonst Englisch.

## Sicherheit

**Entsperrt wird je Befehl.** Jeder Befehl, der den Tresor liest, fragt nach der Passphrase,
meldet sich an, entsperrt, lädt und prüft, und am Ende meldet er die Sitzung beim Server wieder ab
und überschreibt den Kontoschlüssel im Arbeitsspeicher. Es gibt keinen Agenten und keine Datei mit
einem entsperrten Schlüssel, darum hat `lock` nichts zu tun. Warum, steht im
[Projektplan](plan.md#entscheidungen) unter „CLI entsperrt je Befehl“.

**Auf der Festplatte** liegt nur, was auch die Web-App auf dem Gerät hält: Server, Konto-ID,
Secret Key und eine zufällige Geräte-ID in `$XDG_CONFIG_HOME/kennwort/device.json` (sonst
`~/.config/kennwort/device.json`), wie die Web-App sie im lokalen Speicher des Browsers hält, und
daneben in `state.json` der Kontozustand, den der Rechner zuletzt gesehen hat, unter dem
Kontoschlüssel verschlüsselt wie in der Offline-Kopie der Web-App. Ihn führt jeder Befehl mit dem
Stand des Servers zusammen, damit ein Server, der einen älteren Stand zurückspielt, die Prüfung
nicht hinter das zurückwirft, was dieser Rechner schon geprüft hat (etwa wie weit jedes
Tresor-Protokoll reichte). Der Ordner hat die Rechte 0700, die Dateien 0600; darf jemand anderes
`device.json` lesen, verweigert `kennwort` sie, wie ssh einen solchen privaten Schlüssel. Ohne die
Passphrase entsperrt nichts davon das Konto. `logout` löscht beide Dateien.

**Passphrase und Secret Key** kommen vom Terminal, ohne dass das Terminal sie anzeigt, nie aus
einem Argument (das jeder auf dem Rechner in der Prozessliste sieht und das in der Shell-Historie
landet) und nie aus einer Umgebungsvariablen. Für Skripte liest `--passphrase-stdin` die Passphrase
aus stdin, etwa aus einem Geheimnis-Speicher:

```sh
secret-tool lookup service kennwort | kennwort get "WLAN Büro" --passphrase-stdin --yes
```

**Lesen per Bestätigung.** Nur `get` gibt ein Geheimnis aus, und nur nach einem `j` (oder `ja`,
`y`, `yes`), das jemand am Terminal tippt, oder mit `--yes`. Ohne Terminal und ohne `--yes` gibt es
nichts aus; eine Pipe kann nie bestätigen. Fragen und Meldungen gehen auf stderr, auf stdout steht
nur, was du verlangt hast.

**Suche ohne Geheimnisse.** `search` liest nur Titel, Benutzernamen und Adressen, nicht einmal die
Notizen, die die Suche der App liest: Das Terminal behält, was es ausgegeben hat, und die Suche
landet in der Shell-Historie.

**Steuerzeichen** in Titeln, Benutzernamen und Adressen zeigt `kennwort` als `�`: Ein Eintrag, den
ein anderes Mitglied geschrieben hat, könnte sonst mit Escape-Sequenzen das Terminal steuern. Ein
Geheimnis gibt `get` in eine Pipe oder Datei unverändert aus, aufs Terminal ohne Steuerzeichen
(Zeilenumbrüche und Tabs bleiben).

**Keine Geheimnisse in Meldungen.** Fehlermeldungen nennen Optionen nur bis zum `=`, Felder nur mit
ihrer ID und Einträge nur mit Titel und ID, nie eine Passphrase oder einen Wert.

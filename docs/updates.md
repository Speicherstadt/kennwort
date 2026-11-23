---
title: Updates
description: >-
  Kennwort aktualisieren: Releases, das Image auf ghcr.io, der Update-Hinweis für Inhaber und Admins
  (was der Server dafür fragt und wie man ihn abschaltet) und wie ein Release entsteht.
---

# Updates

## Aktualisieren

Vorher ein [Backup](backup.md), dann:

```sh
# Docker Compose
docker compose pull && docker compose up -d

# Podman Quadlet
podman pull ghcr.io/speicherstadt/kennwort:latest && systemctl restart kennwort
```

Der Server migriert die Datenbank beim Start. Zurück auf eine ältere Version geht nur mit dem
Backup von davor: Eine neuere Datenbank kennt die ältere Version nicht, und `restore` nimmt kein
Backup einer neueren Version an. Eine feste Version statt `latest` setzt du in Compose mit
`KENNWORT_VERSION=1.2.3` in `.env`, bei Quadlet im `Image=` der Unit.

Die Web-App aktualisiert sich danach von selbst, aber nur über das signierte Release-Manifest: Der
Service Worker nimmt eine neue Version nur mit gültiger Signatur, passenden Hashes und höherer
Folgenummer an ([Sicherheitsdesign](sicherheitsdesign.md#p-16-ausgelieferter-code)). Ein
Server kann so keine ältere, signierte Version mit einer bekannten Lücke zurückspielen.

## Tags des Images

| Tag | Inhalt |
| --- | --- |
| `x.y.z` | genau dieses Release |
| `x.y` | das neueste Release von x.y, also mit Fehlerbehebungen |
| `latest` | das neueste Release |
| `x.y.z-rc.N`, `next` | Vorabversionen; `latest` bleibt dabei |

## Der Update-Hinweis

Erscheint ein neueres Release, bekommen Inhaber und Admins jeder Firma auf dem Server einmal die
Mitteilung „Eine neuere Version von Kennwort ist erschienen“, in der Glocke und, wo eingeschaltet,
als Push ([Mitteilungen](mitteilungen.md)). Mitglieder bekommen sie nicht.

Dafür fragt der Server zehn Minuten nach dem Start und dann einmal am Tag:

```text
GET https://api.github.com/repos/Speicherstadt/kennwort/releases/latest
Accept: application/vnd.github+json
User-Agent: Kennwort
```

- **Nichts weiter**: kein Cookie, kein Token, keine Version, kein Hostname, keine Zahl von Firmen
  oder Konten. GitHub sieht die Adresse des Servers und dass dort Kennwort läuft, nicht die der
  Personen: Die Browser fragen nie selbst, die CSP bleibt bei `connect-src 'self'`.
- **Fester Host**: Die Adresse steht im Code, und der Server folgt keiner Weiterleitung; eine Antwort
  kommt von `api.github.com` oder gar nicht. Gelesen wird nur `tag_name` als `vX.Y.Z`, höchstens
  256 KiB, nach 10 Sekunden ist Schluss. Vorabversionen und Entwürfe liefert GitHub hier nicht.
- **Nur ein Hinweis**: Installiert wird nichts. Wer die Antwort fälscht, erreicht höchstens eine
  überflüssige Mitteilung; ein Update der Web-App muss trotzdem signiert sein.
- **Einmal je Release**: Die zuletzt gemeldete Version steht in der Datenbank; ein Neustart meldet
  nichts doppelt.

Abschalten, etwa wenn der Server keine Verbindung nach außen haben soll:

```sh
KENNWORT_UPDATE_CHECK=false
```

Dann fragt der Server nie; Releases findest du unter
[GitHub Releases](https://github.com/Speicherstadt/kennwort/releases), dort gibt es auch einen
Atom-Feed.

## Wie ein Release entsteht

Ein Release startest du unter **Actions → Bump version → Run workflow** mit `patch`, `minor` oder
`major` (Release Candidates mit `preminor` und danach `prerelease`). Der Workflow hebt die Version in
`package.json`, setzt das Tag `vX.Y.Z` mit dem Deploy Key und startet damit
`.github/workflows/release.yml` (nach dem Muster von firsttris/workflows); Server und Extension lesen
ihre Version aus derselben `package.json`:

1. CI läuft noch einmal vollständig; das Tag muss zur Version in `package.json` passen.
2. Aus der Geschichte des Commits kommt die Folgenummer des Releases (deshalb holt der Workflow die
   ganze Geschichte), und alles wird damit gebaut: die Web-App mit `release.json` und `release.sig`,
   zweimal gebaut und verglichen, der Server für Linux x64 und arm64, die
   [Kommandozeile](cli.md) für Linux, macOS und Windows, dazu `SHA256SUMS`.
3. Das Image entsteht je Plattform auf einem eigenen Runner (arm64 nativ) und geht nach
   `ghcr.io/speicherstadt/kennwort`. Vorher baut der Workflow die Web-App im Image und vergleicht
   `release.json` und `release.sig` Byte für Byte mit den Release-Dateien.
4. Das GitHub-Release bekommt alle Dateien und die Notizen seit dem letzten Release.

Bis die echten Signatur-Schlüssel erzeugt sind, signiert der Workflow mit dem Test-Schlüssel, und
das Release sagt das. Die Schlüssel erzeugt und verwahrt ein Mensch (Projektplan, „Schritte für
Menschen“). Jeder kann ein Release nachbauen und vergleichen:
[Nachbauen und vergleichen](sicherheitsdesign.md#nachbauen-und-vergleichen-k-408).

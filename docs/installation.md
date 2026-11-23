---
title: Installation
description: >-
  Kennwort selbst betreiben: das Image von ghcr.io mit Docker Compose oder Podman Quadlet, Caddy
  davor für TLS, die Einstellungen und was das Image ausmacht.
---

# Installation

Kennwort ist ein kleiner Server mit einer SQLite-Datenbank. Er speichert nur Chiffretext, öffentliche
Schlüssel und was er zum Anmelden braucht; entschlüsselt wird ausschließlich auf den Geräten
([Sicherheits-Übersicht](sicherheit.md)). Er läuft gut auf einem kleinen Server, einem NAS oder
einer VM. Davor gehört ein Reverse Proxy mit TLS; die Dateien in `docker/` nehmen dafür Caddy.

## Was du brauchst

- einen Server mit Docker und Docker Compose, oder Podman ab Version 5 mit systemd;
- einen DNS-Namen, der auf den Server zeigt, etwa `kennwort.weber-haustechnik.de`, und die Ports
  80 und 443 von außen (Caddy holt damit das Zertifikat von Let's Encrypt);
- das Image `ghcr.io/speicherstadt/kennwort` (amd64 und arm64). Es kommt mit jedem Release, siehe
  [Updates](updates.md).

## Mit Docker Compose

Aus dem Repository brauchst du `docker/compose.yaml`, `docker/Caddyfile` und
`docker/kennwort.env.example`:

```sh
mkdir kennwort && cd kennwort
curl -fsSLO https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/compose.yaml
curl -fsSLO https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/Caddyfile
curl -fsSL -o .env https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/kennwort.env.example
chmod 600 .env
```

In `.env` trägst du ein:

| Einstellung | Wert |
| --- | --- |
| `KENNWORT_DOMAIN` | der DNS-Name, etwa `kennwort.weber-haustechnik.de` |
| `KENNWORT_AUTH_SECRET` | mindestens 32 zufällige Zeichen, einmal erzeugt: `openssl rand -base64 48` |
| `KENNWORT_SETUP_CODE` | mindestens 16 Zeichen; damit legt der erste Inhaber die Firma an |

Dann:

```sh
docker compose up -d
docker compose ps        # kennwort: healthy
```

Jonas öffnet `https://kennwort.weber-haustechnik.de`, gibt den Einrichtungs-Code ein und legt
Weber Haustechnik an ([Konto und Entsperren](konto.md)). Wer weitere Firmen anlegen will, behält den
Code; sonst löschst du die Zeile aus `.env` und startest neu (`docker compose up -d`).

## Mit Podman Quadlet

`docker/quadlet/` enthält dieselben zwei Container als systemd-Units: `kennwort.container`,
`kennwort-caddy.container`, ein Netz und drei Volumes. Als root:

```sh
mkdir -p /etc/kennwort
cp docker/quadlet/* /etc/containers/systemd/
cp docker/Caddyfile /etc/kennwort/Caddyfile
cp docker/kennwort.env.example /etc/kennwort/kennwort.env
chmod 600 /etc/kennwort/kennwort.env
# KENNWORT_DOMAIN, KENNWORT_PUBLIC_URL, KENNWORT_AUTH_SECRET und KENNWORT_SETUP_CODE eintragen
systemctl daemon-reload
systemctl start kennwort-caddy      # startet kennwort mit
```

Bei Quadlet setzt du `KENNWORT_PUBLIC_URL=https://<domain>` selbst; Compose leitet ihn aus
`KENNWORT_DOMAIN` ab. `podman auto-update` würde ein neues `:latest` selbst holen
(`AutoUpdate=registry`); lies vorher [Updates](updates.md).

## Caddy und die Sicherheits-Kopfzeilen

Der Server liefert die Web-App selbst aus (`KENNWORT_WEB_ROOT=/app/web` im Image) und setzt jede
Sicherheits-Kopfzeile selbst: die Content Security Policy, HSTS und die übrigen aus der Tabelle im
[Sicherheitsdesign](sicherheitsdesign.md#p-16-ausgelieferter-code). `docker/Caddyfile` reicht
deshalb nur durch:

```text
{$KENNWORT_DOMAIN} {
	reverse_proxy kennwort:8100
}
```

Setze im Proxy keine dieser Kopfzeilen ein zweites Mal: Zwei CSP-Kopfzeilen gelten beide, zwei
`Strict-Transport-Security` sind ein Fehler. Mit `KENNWORT_BEHIND_PROXY=true` (setzen Compose und
das Beispiel für Quadlet) zählen die Ratenbegrenzungen die Adresse, die Caddy in `X-Forwarded-For`
anhängt.

Soll Caddy die Web-App selbst ausliefern, nimmst du `docker/Caddyfile.static`: Es reicht nur
`/api`, `/auth` und `/health` an den Server weiter und sendet für die Dateien der Web-App genau die
Kopfzeilen der Tabelle, hinter https. Ein Test vergleicht jeden Wert mit dem Code
(`apps/server/src/deploy/deploy.test.ts`); ändere sie nie nur dort. Den Server startest du dann ohne
`KENNWORT_WEB_ROOT` und legst den Web-Build (`/app/web` im Image oder `kennwort-web-<version>.tar.gz`
aus dem Release) unter `/srv/kennwort-web` in den Caddy-Container.

## Einstellungen

Der Server liest nur Umgebungsvariablen; das Image setzt `KENNWORT_PORT=8100`,
`KENNWORT_DATABASE=/data/kennwort.db` und `KENNWORT_WEB_ROOT=/app/web`.

| Einstellung | Standard | Bedeutung |
| --- | --- | --- |
| `KENNWORT_PUBLIC_URL` | `http://localhost:8100` | die Adresse, die Menschen öffnen; Passkeys hängen an ihrem Host, mit `https://` setzt der Server HSTS |
| `KENNWORT_AUTH_SECRET` | – | signiert Sitzungen, mindestens 32 Zeichen, nie ändern (alle müssen sich sonst neu anmelden) |
| `KENNWORT_SETUP_CODE` | – | legt neue Firmen an (`POST /auth/setup`), mindestens 16 Zeichen, steht nie im Log |
| `KENNWORT_BEHIND_PROXY` | `false` | hinter einem Reverse Proxy `true` |
| `KENNWORT_LOG_LEVEL` | `info` | `debug`, `info`, `warn` oder `error`; ein Log enthält nie ein Geheimnis |
| `KENNWORT_PUSH`, `KENNWORT_PUSH_SUBJECT`, `KENNWORT_PUSH_HOSTS` | an | Web-Push, siehe [Mitteilungen](mitteilungen.md) |
| `KENNWORT_PWNED_URL` | Pwned Passwords | Leak-Check über den Server, `off` schaltet ihn ab ([Einträge](eintraege.md)) |
| `KENNWORT_OIDC_*` | – | Anmeldedienst, siehe [Anmeldedienst und Deep Links](anmeldedienst.md) |
| `KENNWORT_UPDATE_CHECK` | `true` | Update-Hinweis an Inhaber und Admins, `false` schaltet ihn ab ([Updates](updates.md)) |

## Das Image

- **Mehrstufig gebaut**: Bun (dieselbe Version wie `packageManager` in `package.json`) baut den
  Server mit `bun build --compile` und die Web-App samt `release.json` und `release.sig`; zur
  Laufzeit bleibt `gcr.io/distroless/cc-debian12:nonroot` mit diesen beiden Dingen, ohne Shell und
  ohne Paketmanager.
- **Ohne root**: Der Server läuft als Benutzer 65532; beschreibbar ist nur `/data`. Compose und
  Quadlet starten ihn mit schreibgeschütztem Dateisystem, ohne Capabilities und mit
  `no-new-privileges`.
- **Healthcheck**: `kennwort-server health` fragt `/health` des Servers im Container (das Image hat
  kein curl). `/health` antwortet erst, wenn die Datenbank antwortet.
- **Nachprüfbar**: Die Web-App im Image ist Byte für Byte die des Releases; der Release-Workflow
  vergleicht `release.json` und `release.sig`, und jeder kann den Build nachbauen
  ([Nachbauen und vergleichen](sicherheitsdesign.md#nachbauen-und-vergleichen-k-408)).

Selbst bauen, im Repository:

```sh
docker build -f docker/Dockerfile -t kennwort .
```

Ohne `--build-arg SOURCE_DATE_EPOCH=<folgenummer>` bekommt die Web-App die Bauzeit als Folgenummer
und ist mit dem Test-Schlüssel signiert: gut zum Ausprobieren, nicht für den Betrieb.

## Ohne Container

Das Release enthält `kennwort-server-<version>-linux-x64` und `-linux-arm64` sowie den Web-Build
als `kennwort-web-<version>.tar.gz`. Den Server startest du mit denselben Umgebungsvariablen,
etwa als systemd-Dienst unter einem eigenen Benutzer, mit `KENNWORT_WEB_ROOT` auf dem entpackten
Web-Build und einem Reverse Proxy davor.

Weiter: [Backups](backup.md) und [Updates](updates.md).

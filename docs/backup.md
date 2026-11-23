---
title: Backups
description: >-
  Kennwort sichern und wiederherstellen: ein konsistentes Backup der SQLite-Datenbank bei laufendem
  Server, was darin steht (nur Chiffretext, keine Schlüssel) und wie man es zurückspielt.
---

# Backups

Alles, was der Server weiß, steht in einer SQLite-Datei (`/data/kennwort.db` im Image). Ein Backup
ist eine Kopie dieser Datei; der Server macht sie selbst, während er läuft.

## Backup machen

```sh
# Docker Compose
docker compose exec kennwort /app/kennwort-server backup /data/backups/kennwort-$(date +%F).db
docker compose cp kennwort:/data/backups/kennwort-$(date +%F).db ./

# Podman Quadlet
podman exec kennwort /app/kennwort-server backup /data/backups/kennwort-$(date +%F).db
podman cp kennwort:/data/backups/kennwort-$(date +%F).db ./
```

`backup` liest mit SQLites `VACUUM INTO` einen einzigen Moment der Datenbank, auch während Personen
Einträge speichern; eine halbe Transaktion kommt nie hinein. Die Kopie entsteht zuerst unter einem
anderen Namen, wird mit `PRAGMA integrity_check` geprüft und erst dann umbenannt: Eine Datei unter
dem Namen des Backups ist immer ganz. Eine vorhandene Datei überschreibt `backup` nie, und die
Kopie darf nur ihr Besitzer lesen (0600). Der Befehl braucht nur `KENNWORT_DATABASE`, nicht das
Sitzungsgeheimnis.

Einfach die Datei kopieren, während der Server läuft, ist kein Backup: Im WAL-Modus liegt ein Teil
der Daten in `kennwort.db-wal`, und die Kopie kann mitten in einem Schreibvorgang liegen.

Am besten jede Nacht per cron oder systemd-Timer, die Kopie anschließend auf einen anderen Rechner
und alte Kopien nach einer Frist löschen. Ein Backup im selben Volume schützt nicht vor dem Verlust
des Servers.

## Was ein Backup enthält

Das Backup ist so verschlüsselt wie die Datenbank selbst; der Server hat nie mehr:

| Steht im Backup | Steht nicht im Backup |
| --- | --- |
| Einträge, Tresorschlüssel und Kontozustand als Chiffretext (XChaCha20-Poly1305, gebunden an Eintrag, Tresor und Version) | ein Klartext-Eintrag, ein Passwort, ein Tresorname |
| öffentliche Schlüssel, Zertifikate und die signierten Mitglieder-Protokolle | Account Key, Secret Key, Passphrase, Recovery-Kit, ein privater Schlüssel eines Kontos oder der Firma |
| die Anmeldedaten des Servers: Prüfwerte für die Anmeldung mit Passphrase, Passkey-Zugangsdaten (öffentlich), laufende Sitzungen (höchstens 7 Tage gültig) | der Einrichtungs-Code und das Sitzungsgeheimnis (`KENNWORT_AUTH_SECRET`); die stehen in den Einstellungen, nicht in der Datenbank |
| Mitteilungen, Protokoll der Firma, Einmal-Links als Chiffretext, der VAPID-Schlüssel für Web-Push, die Zuordnung zum Anmeldedienst | – |

Wer ein Backup stiehlt, kann also nichts entschlüsseln ([Bedrohungsmodell](plan.md#bedrohungsmodell),
„Datenbank gestohlen“), wohl aber versuchen, Passphrasen offline zu raten: Dagegen helfen der Secret
Key (128 Bit, nie auf dem Server) und Argon2id. Mit den Sitzungen darin und dem
Sitzungsgeheimnis könnte er sich bis zu sieben Tage als angemeldetes Gerät ausgeben, ohne etwas zu
lesen. Bewahre Backups deshalb so auf wie die Datenbank: nur für Betreiber lesbar, verschlüsselt,
wenn sie außer Haus liegen.

## Wiederherstellen

Nur bei gestopptem Server. Beim Zurückspielen in einen laufenden Server gingen alle seine weiteren
Schreibvorgänge still verloren; `restore` verweigert das deshalb (`"reason":"in-use"`).

```sh
# Docker Compose
docker compose stop kennwort
docker compose cp ./kennwort-2026-11-23.db kennwort:/data/backups/
docker compose run --rm kennwort restore /data/backups/kennwort-2026-11-23.db
docker compose up -d

# Podman Quadlet
systemctl stop kennwort-caddy kennwort
podman run --rm -v kennwort-data:/data -v "$PWD/kennwort-2026-11-23.db:/restore.db:ro,Z" \
  ghcr.io/speicherstadt/kennwort:latest restore /restore.db
systemctl start kennwort-caddy
```

`restore` nimmt nur ein unbeschädigtes Backup von Kennwort, das von dieser oder einer älteren Version
stammt; eine ältere migriert der Server beim Start. Die ersetzte Datenbank bleibt als
`kennwort.db.replaced-<zeit>` daneben liegen, bis du sie löschst. Auf einen neuen Server
zurückspielen geht genauso: Volume anlegen, `restore`, starten, mit demselben
`KENNWORT_AUTH_SECRET` und derselben `KENNWORT_PUBLIC_URL` (Passkeys hängen am Host).

Was nach dem Backup geschrieben wurde, ist danach weg: neue Einträge, Änderungen, Mitglieder. Für
die Geräte sieht ein älteres Backup aus wie ein Server, der einen alten Stand zurückspielt: Ein
Gerät, das schon einen neueren Stand eines Tresor-Protokolls oder seines Kontozustands geprüft hat,
nimmt keinen älteren an und zeigt, was er betrifft, nicht an, statt ihm zu trauen (E-07, E-13 im
[Sicherheitsdesign](sicherheitsdesign.md)). Nimm deshalb immer das jüngste Backup, und mach eins
vor jedem Update.

Geprüft wird beides in CI: ein Test macht ein Backup eines laufenden Servers mit Weber Haustechnik,
spielt es in einen frischen Server zurück und öffnet Jonas' Konto dort wie die Kommandozeile, mit
jeder Prüfung (`apps/cli/src/backup-restore.integration.test.ts`); die Server-Tests prüfen die
Weigerungen (`apps/server/src/operations`).

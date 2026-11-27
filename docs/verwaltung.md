---
title: Verwaltung
description: >-
  Kennwort für Inhaber und Admins: Mitglieder, Rollen, Firmen-Richtlinien, Tresore, Audit-Log,
  Sicherheitsbericht und der Betrieb des Servers.
---

# Verwaltung

Diese Seite ist der Überblick für Inhaber und Admins: was es zu verwalten gibt und wo es steht.
Jede Änderung an Mitgliedschaften unterschreibt ein Gerät; der Server speichert sie nur und kann
niemandem heimlich Zugriff geben.

## Mitglieder und Rollen

| Aufgabe | Wer | Wo |
| --- | --- | --- |
| Jemanden einladen und bestätigen | Inhaber, Admin | [Mitglieder einladen](konto.md#mitglieder-einladen) |
| Rolle ändern (Inhaber, Admin, Mitarbeiter) | Inhaber | [Rollen](konto.md#rollen) |
| Jemanden aus der Firma entfernen | Inhaber, Admin | [Austritt aus der Firma](konto.md#austritt-aus-der-firma) |
| Neuen Firmenschlüssel anlegen | Inhaber, Admin | [Neuer Firmenschlüssel](konto.md#neuer-firmenschlussel) |
| Neue Personen über den Anmeldedienst aufnehmen | Inhaber, Admin | [Anmeldedienst](anmeldedienst.md#neue-personen-aufnehmen) |

## Firmen-Richtlinien

Unter **Team → Mitglieder → Firmen-Richtlinien** legt ein Inhaber fest, was für alle gilt:
die Zeit bis zum automatischen Sperren ([Automatisch sperren](konto.md#automatisch-sperren)) und
die Firmen-Recovery ([Firmen-Recovery](konto.md#firmen-recovery)). Die Richtlinien sind mit dem
Firmenschlüssel unterschrieben; der Server kann sie nicht ändern.

## Tresore

Tresore ordnen die Zugänge. Wer einen Tresor verwaltet, gibt Personen direkt Zugriff – auch
mehreren auf einmal oder auf Zeit –, beantwortet Zugriffsanfragen und nimmt Personen wieder heraus;
danach wechselt Kennwort den Tresor-Schlüssel und setzt alles, was die Person lesen konnte, auf
„Zum Ändern“. Mehr unter [Tresore](tresore.md) und [Team](team.md).

## Nachvollziehen und prüfen

- **Audit-Log**: wer wann was getan hat, als Hash-Kette, die sich nicht stellenweise ändern lässt;
  Exporte, Einmal-Links und Wiederherstellungen stehen darin.
- **Sicherheits-Übersicht und Monatsbericht**: schwache, mehrfach verwendete und geleakte
  Passwörter, für Inhaber und Admins jeden Monat als Bericht ([Sicherheits-Übersicht](sicherheit.md)).
- **Export**: Inhaber und Admins exportieren Tresore verschlüsselt, als KeePass-Datei oder CSV
  ([Import und Export](import-export.md)).

## Den Server betreiben

[Installation](installation.md), [Backups](backup.md) und [Updates](updates.md) beschreiben den
Betrieb. Erscheint ein neues Release, bekommen Inhaber und Admins eine Mitteilung in der App.
Wer Daten zu einer Person herausgeben oder löschen muss, findet das unter
[Datenschutz](datenschutz.md).

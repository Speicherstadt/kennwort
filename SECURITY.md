# Sicherheit

## Unterstützte Versionen

Sicherheitsfixes gibt es nur für das neueste Release. Bitte vor einer Meldung auf die neueste Version aktualisieren.

| Version | Unterstützt |
| --- | --- |
| [neuestes Release](https://github.com/Speicherstadt/kennwort/releases/latest) | ja |
| ältere Releases | nein |

## Eine Lücke melden

Bitte **kein öffentliches Issue** für ein Sicherheitsproblem. Melde es privat über GitHub:
[Security › Report a vulnerability](https://github.com/Speicherstadt/kennwort/security/advisories/new).

Eine gute Meldung nennt die Version, den betroffenen Teil (Server, Web-App, Extension, App, CLI), wie sich das
Problem nachstellen lässt und was ein Angreifer damit erreicht. Keine echten Passwörter, Exportdateien oder
Schlüssel mitschicken. Wir bestätigen die Meldung, arbeiten den Fix in einem privaten Security Advisory aus und
veröffentlichen es mit dem Release, das ihn behebt.

Kennwort ist dafür gebaut, auch einem bösartigen Server standzuhalten. Besonders wichtig sind deshalb:

- alles, womit der Server oder ein Angreifer im Netz Klartext, Schlüssel oder Passphrasen erfährt;
- Wege, jemandem ohne gültige Signatur eines Verwalters Zugriff auf einen Tresor zu verschaffen;
- vertauschte, alte oder unterschobene Geheimtexte und Schlüssel, die der Client nicht erkennt;
- Ausfüllen durch die Extension auf einer fremden Seite, in einem fremden Frame oder ohne Klick;
- Lücken in Anmeldung, Rechten, Recovery und Notfallzugriff.

Probleme in Bun, Caddy, den `@noble`-Bibliotheken oder anderen eingebundenen Programmen gehören zu diesen
Projekten; macht erst die Art, wie Kennwort sie einsetzt, sie ausnutzbar, bitte hier melden.

## Abhängigkeiten aktuell halten

Die Abhängigkeiten hält [Renovate](https://github.com/apps/renovate) aktuell, mit den gemeinsamen Einstellungen aus
[firsttris/workflows](https://github.com/firsttris/workflows/blob/main/renovate/default.json5). Jedes Update kommt
als Pull Request und läuft durch die ganze CI. Ein neues Release übernimmt Renovate erst nach einigen Tagen; CI und
Images installieren mit `bun install --frozen-lockfile` genau die Versionen aus `bun.lock`. Neue
Laufzeit-Abhängigkeiten im Client brauchen einen Eintrag mit Begründung in der Liste erlaubter Pakete.

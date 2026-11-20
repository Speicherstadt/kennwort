---
title: Konto und Entsperren
description: >-
  Wie man in Kennwort eine Firma anlegt, eine Einladung annimmt, das Recovery-Kit sichert, auf
  einem neuen Gerät entsperrt und wann Kennwort sich selbst sperrt.
---

# Konto und Entsperren

Alle Schlüssel entstehen auf deinem Gerät. Der Server bekommt nur Geheimtexte und öffentliche
Schlüssel; deine Passphrase verlässt das Gerät nie. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-01-konto-anlegen).

## Firma anlegen

Wer einen Kennwort-Server betreibt, setzt in seinen Einstellungen einen Einrichtungs-Code
(`KENNWORT_SETUP_CODE`, mindestens 16 Zeichen). Mit ihm legt der erste Inhaber eine Firma an:

1. **Firma anlegen** wählen, den Einrichtungs-Code eingeben.
2. Eine Passphrase wählen: mindestens vier Wörter oder 16 Zeichen. Niemand kann sie zurücksetzen,
   auch der Betreiber nicht.
3. Das Recovery-Kit sichern (unten) und bestätigen.

Ein IT-Dienstleister legt mit demselben Code weitere Firmen auf seinem Server an. Eine bestehende
Firma öffnet der Code nicht: In eine Firma kommt man nur mit einer Einladung.

## Einladung annehmen

Ein Inhaber oder Admin schickt dir einen Einladungslink. Er gilt sieben Tage und nur einmal. Öffne
ihn, wähle eine Passphrase und sichere dein Recovery-Kit. Der Teil des Links hinter `#` erreicht den
Server nie; er enthält den Fingerabdruck des Firmenschlüssels, an dem dein Gerät die Firma erkennt.

## Das Recovery-Kit

Nach dem Anlegen zeigt Kennwort einmal drei Angaben:

| Angabe | Wofür |
| --- | --- |
| Konto-ID | sagt dem Server, wer du bist |
| Secret Key (`K1-…`) | macht zusammen mit der Passphrase deine Schlüssel; ohne ihn hilft eine erratene Passphrase nichts |
| Recovery Key (`R1-…`) | öffnet dein Konto, wenn du die Passphrase vergisst |

Schreib sie auf oder drucke sie aus und bewahre sie sicher auf. Erst dann geht es weiter.

## Entsperren

Dein Gerät merkt sich Konto-ID und Secret Key, nie die Passphrase. Zum Entsperren reicht deshalb
die Passphrase. Auf einem neuen Gerät wählst du **Anderes Konto** und gibst Konto-ID, Secret Key und
Passphrase ein; danach kennt auch dieses Gerät dein Konto.

## Automatisch sperren

Kennwort sperrt sich nach zehn Minuten ohne Tastendruck oder Klick, und sofort mit **Sperren** in der
Seitenleiste oder in den Einstellungen. Beim Sperren löscht Kennwort die Schlüssel aus dem Speicher;
nach dem Entsperren bist du wieder auf derselben Seite. Auch ein Neuladen der Seite sperrt, denn die
Schlüssel liegen nur im Arbeitsspeicher.

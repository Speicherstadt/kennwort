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

Mit **Als PDF speichern** bekommst du ein Blatt zum Ausdrucken mit allen drei Angaben, der Adresse
des Servers und einem QR-Code. Das PDF entsteht auf deinem Gerät; nichts davon geht an den Server.
Bewahre das Blatt sicher auf und bestätige, dass du es getan hast. Erst dann geht es weiter.

Der QR-Code öffnet auf einem neuen Gerät die Entsperr-Seite deines Servers und füllt Konto-ID und
Secret Key aus; die Passphrase gibst du selbst ein. Der Recovery Key steht nicht im Code, ein Foto
davon öffnet dein Konto also nicht.

## Entsperren

Dein Gerät merkt sich Konto-ID und Secret Key, nie die Passphrase. Zum Entsperren reicht deshalb
die Passphrase. Auf einem neuen Gerät wählst du **Anderes Konto** und gibst Konto-ID, Secret Key und
Passphrase ein, oder du scannst den QR-Code auf dem Recovery-Kit; danach kennt auch dieses Gerät
dein Konto.

## Passphrase vergessen

Auf der Entsperr-Seite führt **Passphrase vergessen?** zum Recovery Key: Konto-ID (auf einem
bekannten Gerät schon ausgefüllt) und Recovery Key aus dem Recovery-Kit eingeben, eine neue
Passphrase wählen. Danach zeigt Kennwort ein neues Recovery-Kit; mit dem alten Recovery Key und der
alten Passphrase meldet sich niemand mehr an. Speichere das neue Kit wieder als PDF und bewahre es
sicher auf.

!!! warning "Wenn das Kit in fremde Hände geraten ist"
    Der neue Recovery Key sperrt die Anmeldung mit dem alten. Wer aber früher eine Kopie der
    verschlüsselten Daten deines Kontos bekommen hat, kann sie mit dem alten Recovery Key weiter
    öffnen. Davor schützt erst ein Schlüsselwechsel, den Kennwort mit dem Austritt (K-307) bringt.

Auf deinem bekannten Gerät bleibt der Secret Key gleich, deine anderen Geräte entsperren also mit
der neuen Passphrase weiter. Auf einem fremden Gerät bekommst du einen neuen Secret Key; deine
anderen Geräte brauchen ihn dann zusammen mit der neuen Passphrase.

## Automatisch sperren

Kennwort sperrt sich nach zehn Minuten ohne Tastendruck oder Klick, und sofort mit **Sperren** in der
Seitenleiste oder in den Einstellungen. Beim Sperren löscht Kennwort die Schlüssel aus dem Speicher;
nach dem Entsperren bist du wieder auf derselben Seite. Auch ein Neuladen der Seite sperrt, denn die
Schlüssel liegen nur im Arbeitsspeicher.

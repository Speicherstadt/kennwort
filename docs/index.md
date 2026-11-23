---
title: Kennwort – der Passwortmanager für dein Team
description: >-
  Kennwort: der selbst gehostete, Ende-zu-Ende-verschlüsselte Passwortmanager für Teams in kleinen
  Betrieben. Web-App, Browser-Extension und App, ohne Kosten pro Benutzer.
---

# Kennwort

**Die Zugänge deines Teams – nur für euch lesbar, auf deinem eigenen Server.**

Kennwort ist ein selbst gehosteter Passwortmanager für kleine Betriebe: Tresore und Gruppen fürs
Team, eine Browser-Extension, die erst nach Klick ausfüllt, und eine App fürs Handy.
Ende-zu-Ende-verschlüsselt, mit Post-Quanten-Schutz, Open Source.

!!! warning "In Entwicklung"
    Kennwort ist noch nicht veröffentlicht. Was geplant ist, steht im [Projektplan](plan.md).

!!! tip "Ausprobieren ohne Server"
    Die [Demo](https://kennwort.app/demo/) zeigt die Web-App mit der Beispielfirma „Weber
    Haustechnik“ (Jonas, Anna, Sandra und Max). Sie läuft ganz in deinem Browser: Ein Ersatz für den
    Server hält die verschlüsselten Daten nur im Speicher des Tabs, beim Neuladen beginnt alles von
    vorn, und die Seite darf keinen Server erreichen (CSP `connect-src 'none'`). Die Verschlüsselung
    ist dieselbe wie in der echten App, auch Argon2id mit den festen Parametern; deshalb dauert das
    Entsperren ein, zwei Sekunden. Die Passphrase steht oben auf der Seite und ist absichtlich
    schwach. Entsperren kann nur Jonas; Anna, Sandra und Max sind bestätigte Mitglieder, deren
    Passphrase niemand kennt. Gib dort keine echten Passwörter ein.

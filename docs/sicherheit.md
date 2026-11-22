---
title: Sicherheits-Übersicht
description: >-
  Die Seite „Sicherheit“ in Kennwort: schwache, mehrfach verwendete und geleakte Passwörter,
  „Jetzt ändern“, die Prüfung gegen Datenlecks mit k-Anonymität und der Monatsbericht für Inhaber
  und Admins – und was dabei dein Gerät verlässt.
---

# Sicherheits-Übersicht

Die Seite **Sicherheit** zeigt auf einen Blick, welche Passwörter du ändern solltest. Du findest sie
unter **Einstellungen → Sicherheit**, am Desktop ab einer breiten Ansicht auch in der Seitenleiste.
Alles darauf rechnet dein Gerät aus den Einträgen aus, die es ohnehin entschlüsselt hat, über alle
Tresore, die du lesen kannst. Einträge, die jemand mit dir geteilt hat, stehen nicht darin: Du
kannst sie nur lesen, ändern muss sie jemand im Tresor, aus dem sie kommen.

## Was die Seite zeigt

Oben stehen vier Zahlen, darunter je eine Liste:

- **In Datenlecks**: Passwörter, die in der Liste bekannter Datenlecks von Have I Been Pwned stehen,
  mit der Zahl, wie oft sie dort vorkommen. Nur, wenn du die [Prüfung](#prufung-gegen-datenlecks)
  eingeschaltet hast; sonst steht dort „nicht geprüft“.
- **Schwach**: nach derselben Regel wie unter [Zum Ändern](eintraege.md#zum-andern).
- **Mehrfach verwendet**: dasselbe Passwort in mehr als einem Eintrag, mit der Zahl der Einträge.
- **Zum Ändern markiert**: Einträge, deren geheime Felder jemand lesen konnte, der gegangen ist
  ([Wenn jemand geht](tresore.md#wenn-jemand-geht)).

Jede Zeile nennt den Titel und darunter, warum der Eintrag dort steht; ein Tipp auf den Titel öffnet
den Eintrag. Ein Passwort zeigt die Seite nie.

## Jetzt ändern

Neben jedem Eintrag mit Website steht **Jetzt ändern**. Es öffnet in einem neuen Tab die Seite, die
die Website selbst für das Ändern von Passwörtern nennt: `/.well-known/change-password` nach dem
W3C-Vorschlag „A Well-Known URL for Changing Passwords“, etwa
`https://portal.grosshandel.de/.well-known/change-password`. Kennt eine Website die Adresse nicht,
landest du auf ihrer Startseite oder einer Fehlerseite und gehst von dort weiter.

- Port und Schreibweise übernimmt Kennwort aus der Adresse im Eintrag; Namen mit Umlauten schreibt
  es so, wie der Browser sie aufruft (`xn--…`).
- Für ein Gerät mit IP-Adresse oder einem Namen ohne Punkt (Router, NAS, `localhost`) öffnet es die
  Startseite des Geräts: Dort gibt es keine Seite unter `/.well-known/`.
- Nur `http` und `https`: Ein Eintrag mit `javascript:`, `data:`, `file:` oder einem anderen Schema
  bekommt keinen Knopf.
- Der neue Tab bekommt keinen Zugriff auf Kennwort (`noopener`) und erfährt nicht, woher du kommst
  (`noreferrer`).

Nach dem Ändern trägst du das neue Passwort im Eintrag ein; dann verschwindet er aus der Liste.

## Prüfung gegen Datenlecks

Die Prüfung ist **aus**, bis du sie selbst einschaltest: unten auf der Seite, **Passwörter gegen
bekannte Datenlecks prüfen**. Sie gilt nur für dein Konto, auf allen deinen Geräten; die Wahl steht
verschlüsselt in deinem Kontozustand, nicht beim Server. Eine Firma kann sie für niemanden
einschalten, und der Server kann es auch nicht.

So funktioniert sie (k-Anonymität):

1. Dein Gerät bildet von jedem Passwort den SHA-1-Hash, 40 Hex-Zeichen.
2. Nur die **ersten fünf Zeichen** gehen an deinen Kennwort-Server, der sie an den Dienst Pwned
   Passwords von Have I Been Pwned weitergibt.
3. Der Dienst antwortet mit allen bekannten Hashes, die so anfangen, meist 800 bis 1000 Stück, dazu
   erfundene Einträge, damit jede Antwort etwa gleich groß ist.
4. Dein Gerät sucht darin den Rest seines Hashs. Das Passwort und der volle Hash verlassen es nie.

Die Antworten behält dein Gerät nur im Arbeitsspeicher, bis du sperrst; Kennwort fragt jeden Anfang
nur einmal. Der Server hält sie eine Stunde im Speicher, damit dieselbe Anfrage mehrerer Kollegen
nur einmal hinausgeht, und schreibt die Anfänge in kein Log.

Was trotzdem sichtbar wird: Der Server deiner Firma und Have I Been Pwned sehen, welche Anfänge
abgefragt werden; der Server auch, von welchem Konto. Zu einem Anfang gehören Hunderte bekannte
Passwörter und unzählige unbekannte, daraus lässt sich ein Passwort nicht ablesen. Wer möchte, dass
gar nichts davon hinausgeht, lässt die Prüfung aus.

**Für Betreiber**: Der Server fragt `https://api.pwnedpasswords.com/range/`. Mit
`KENNWORT_PWNED_URL` lässt sich ein eigener Spiegel eintragen (die Adresse bis vor den Anfang, mit
`/` am Ende, etwa `http://pwned.intern:8080/range/`), mit `KENNWORT_PWNED_URL=off` schaltest du die
Prüfung für alle auf dem Server ab; dann sagt die Seite „Dein Kennwort-Server bietet die Prüfung
nicht an“.

## Monatsbericht

Inhaber und Admins sehen einmal im Monat oben auf der Seite den **Monatsbericht**: je Tresor, den
ihr Gerät öffnen kann, wie viele Einträge er hat und wie viele davon schwach, mehrfach verwendet,
in Datenlecks oder zum Ändern markiert sind. Er enthält nur Zahlen und die Namen der Tresore, keine
Titel: Ein Titel wie „Kündigung Müller“ sagt manchmal mehr, als auf einem Bildschirm stehen soll, auf
den jemand mitschaut. **Gelesen** blendet ihn bis zum nächsten Monat aus, auf allen deinen Geräten.

Den Bericht rechnet dein Gerät aus, wenn du die Seite öffnest. Als Nachricht in der App, per Push
oder Mail kommt er mit den Benachrichtigungen in einer späteren Version.

Wie das alles technisch abgesichert ist, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-23-sicherheits-ubersicht-und-datenleck-prufung).

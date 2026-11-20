---
title: Konto und Entsperren
description: >-
  Wie man in Kennwort eine Firma anlegt, eine Einladung annimmt, das Recovery-Kit sichert, auf
  einem neuen Gerät entsperrt, wann Kennwort sich selbst sperrt, wie man es als App installiert und
  was ohne Verbindung geht.
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

## Mitglieder einladen

Unter **Einstellungen → Mitglieder** stehen alle Konten deiner Firma mit ihrer Rolle. **Bestätigt**
heißt: Dein Gerät hat geprüft, dass der Firmenschlüssel genau diese Schlüssel für genau dieses Konto
und diese Rolle unterschrieben hat. Was es nicht prüfen kann, steht als **Wartet auf Bestätigung**
oder **Nicht vertrauenswürdig** da.

Als Inhaber oder Admin lädst du hier ein:

1. Gib unter **Jemanden einladen** einen Namen ein und wähle **Einladen**.
2. Kopiere den **Einladungslink** und schick ihn auf einem Weg, dem du vertraust. Er gilt sieben Tage
   und nur einmal.
3. Hat die Person ihr Konto angelegt, erscheint sie in der Liste mit **Bestätigen**. Dein Gerät prüft
   dabei, dass ihre Schlüssel zu deiner Einladung gehören; nur dann bestätigt es sie.

Bestätigen kann, wer die Einladung erstellt hat. Eine Einladung macht immer einen Mitarbeiter und
gilt für genau ein Konto, auch wenn der Server später ein zweites dafür zeigt.

## Rollen

Es gibt drei Rollen: **Inhaber**, **Admin** und **Mitarbeiter**. Inhaber und Admins laden ein und
bestätigen; nur Inhaber vergeben Rollen. Als Inhaber wählst du in der Mitgliederliste bei einem
bestätigten Mitglied eine andere Rolle; deine eigene änderst du nicht, so bleibt die Firma immer mit
einem Inhaber. Wer Inhaber oder Admin wird, bekommt den Firmenschlüssel verschlüsselt auf sein
Konto; sein Gerät nimmt ihn beim nächsten Öffnen der Mitglieder an, wenn er zur Firma passt.

!!! note "Admin wieder zum Mitarbeiter machen"
    Kennwort löscht dann den Firmenschlüssel auf dem Server für dieses Konto. Eine Kopie, die sein
    Gerät schon hat, bleibt dort. Wer der Person nicht mehr traut, braucht einen neuen
    Firmenschlüssel; das kommt mit einem späteren Teil des Austritts (K-307).

## Austritt aus der Firma

Verlässt jemand die Firma, entfernt ihn ein Inhaber (oder bei Mitarbeitern ein Admin) aus der
Firma. Der Server sperrt das Konto sofort: Alle seine Geräte sind abgemeldet, und es kommt an
nichts mehr heran, auch nicht mit einer Sitzung, die es noch hat. In der Mitgliederliste bleibt es
mit dem Tag des Austritts stehen, denn seine Unterschriften in den Tresoren müssen prüfbar bleiben.
Aus den Tresoren entfernt es danach das Gerät eines Verwalters, mit neuem Tresor-Schlüssel (siehe
[Tresore](tresore.md)). Die Schaltfläche dafür bringt der nächste Teil von K-307.

!!! warning "Wenn der Firmenschlüssel nicht passt"
    Zeigt Kennwort statt der Mitglieder den Hinweis, dass der Firmenschlüssel nicht zu deinem Konto
    passt, hat der Server einen anderen Schlüssel geliefert als den, den dein Gerät beim Anlegen oder
    über den Einladungslink kennt. Kennwort vertraut dann keinem Mitglied. Sprich mit dem, der den
    Server betreibt.

## Einladung annehmen

Ein Inhaber oder Admin schickt dir einen Einladungslink. Er gilt sieben Tage und nur einmal. Öffne
ihn, wähle eine Passphrase und sichere dein Recovery-Kit. Der Teil des Links hinter `#` erreicht den
Server nie. Er enthält den Fingerabdruck des Firmenschlüssels, an dem dein Gerät die Firma erkennt,
und ein Geheimnis, mit dem dein Gerät deine Schlüssel an diese Einladung bindet. Erst wenn das
Gerät des Einladenden diese Bindung geprüft hat, bestätigt es deine Schlüssel für die Firma; einem
Schlüssel, den der Server unterschiebt, fehlt sie.

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

## Neues Gerät verbinden

Ohne Konto-ID und Secret Key abzutippen: Wähle auf dem neuen Gerät **Mit einem anderen Gerät
verbinden**. Es zeigt einen QR-Code und darunter denselben Link.

1. Scanne den Code mit der Kamera eines Geräts, auf dem Kennwort entsperrt ist; der Link öffnet dort
   **Gerät hinzufügen**. Oder öffne dort **Einstellungen → Gerät hinzufügen** und füge den Link ein.
2. Beide Geräte zeigen einen sechsstelligen Code. Nur wenn er gleich ist: auf dem neuen Gerät
   **Code stimmt**, auf dem entsperrten **Code stimmt – Gerät hinzufügen**.
3. Das neue Gerät ist entsperrt und kennt dein Konto; später entsperrt es mit deiner Passphrase.

Der Link enthält ein Geheimnis, das der Server nie sieht; ohne es kann er dem neuen Gerät kein
falsches Konto unterschieben. Eine Verbindung gilt zehn Minuten.

## Geräte

Unter **Einstellungen → Angemeldete Geräte** stehen alle Geräte, auf denen du angemeldet bist, mit
Browser, System und wann sie zuletzt aktiv waren; dein aktuelles ist als **Dieses Gerät** markiert.

- **Abmelden** beendet die Sitzung eines anderen Geräts, etwa eines verlorenen Telefons. Es bekommt
  danach nichts mehr vom Server, bis es sich neu anmeldet – und dafür braucht es deine Passphrase.
- **Dieses Gerät abmelden** sperrt Kennwort und lässt das Gerät Konto-ID und Secret Key vergessen.
  Danach zeigt es wieder die Begrüßung; zum Entsperren brauchst du das Recovery-Kit oder ein anderes
  Gerät.

## Passphrase vergessen

Auf der Entsperr-Seite führt **Passphrase vergessen?** zum Recovery Key: Konto-ID (auf einem
bekannten Gerät schon ausgefüllt) und Recovery Key aus dem Recovery-Kit eingeben, eine neue
Passphrase wählen. Danach zeigt Kennwort ein neues Recovery-Kit; mit dem alten Recovery Key und der
alten Passphrase meldet sich niemand mehr an. Speichere das neue Kit wieder als PDF und bewahre es
sicher auf.

!!! warning "Wenn das Kit in fremde Hände geraten ist"
    Der neue Recovery Key sperrt die Anmeldung mit dem alten. Wer aber früher eine Kopie der
    verschlüsselten Daten deines Kontos bekommen hat, kann sie mit dem alten Recovery Key weiter
    öffnen. Davor schützt erst ein Wechsel deines Account Key und deiner Schlüssel, den ein späterer
    Teil von K-307 bringt.

Auf deinem bekannten Gerät bleibt der Secret Key gleich, deine anderen Geräte entsperren also mit
der neuen Passphrase weiter. Auf einem fremden Gerät bekommst du einen neuen Secret Key; deine
anderen Geräte brauchen ihn dann zusammen mit der neuen Passphrase.

## Automatisch sperren

Kennwort sperrt sich nach zehn Minuten ohne Tastendruck oder Klick, und sofort mit **Sperren** in der
Seitenleiste oder in den Einstellungen. Die Zeit legt ein Inhaber für die ganze Firma fest, unter
**Einstellungen → Mitglieder → Firmen-Richtlinien**, zwischen einer und sechzig Minuten; sie gilt
auf allen Geräten aller Mitglieder. Die Richtlinie ist mit dem Firmenschlüssel unterschrieben, der
Server kann sie nicht ändern. Beim Sperren löscht Kennwort die Schlüssel aus dem Speicher;
nach dem Entsperren bist du wieder auf derselben Seite. Auch ein Neuladen der Seite sperrt, denn die
Schlüssel liegen nur im Arbeitsspeicher.

## Als App installieren

Kennwort lässt sich aus dem Browser wie eine App installieren und startet dann in einem eigenen
Fenster, am Handy vom Startbildschirm:

- **Chrome und Edge am Computer**: das Symbol **App installieren** rechts in der Adressleiste.
- **Android**: im Browsermenü **Zum Startbildschirm hinzufügen** oder **App installieren**.
- **iPhone und iPad**: in Safari **Teilen → Zum Home-Bildschirm**.

Eine neue Version nimmt Kennwort nur an, wenn sie vom Kennwort-Projekt signiert ist und jede Datei
genau der signierten entspricht. Liefert dein Server etwas anderes aus, bleibt die bisherige Version
aktiv. Ist eine geprüfte neue Version bereit, zeigt Kennwort **Neue Version bereit** mit
**Neu laden**; bis dahin läuft die bisherige weiter. Was das schützt und was nicht, steht im
[Sicherheitsdesign](sicherheitsdesign.md#signierte-releases-der-pwa).

## Ohne Verbindung

Kennwort hält auf jedem Gerät, auf dem du entsperrt hast, eine verschlüsselte Kopie deines Kontos
und deiner Tresore. Ist der Server nicht erreichbar – im Keller ohne Netz, im Flugzeug, bei einer
Störung –, entsperrst du trotzdem mit deiner Passphrase und liest deine Einträge. Kennwort zeigt
dann unten **Offline – nur lesen** mit der Zeit des letzten Abgleichs. Anlegen, Bearbeiten,
Favoriten und Teilen gehen erst wieder mit Verbindung; sobald der Server antwortet, gleicht
Kennwort von selbst ab und der Hinweis verschwindet.

- Die Kopie enthält nur Verschlüsseltes, nie deine Passphrase oder einen Eintrag im Klartext.
  Wer dein Gerät hat, braucht weiter die Passphrase.
- Sie zeigt den Stand des letzten Abgleichs: Was jemand seitdem geändert hat, siehst du erst wieder
  mit Verbindung.
- **Sperren** lässt die Kopie liegen, damit du ohne Verbindung entsperren kannst. **Dieses Gerät
  abmelden** unter **Einstellungen → Angemeldete Geräte** löscht sie.
- Auf einem Gerät, auf dem du noch nie mit Verbindung entsperrt hast, gibt es keine Kopie; dort
  sagt Kennwort, dass der Server nicht erreichbar ist.

Wie die Kopie gegen einen Server schützt, der dir einen alten Stand unterschieben will, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-22-offline-kopie).

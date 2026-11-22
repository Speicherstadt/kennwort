---
title: Konto und Entsperren
description: >-
  Wie man in Kennwort eine Firma anlegt, eine Einladung annimmt, das Recovery-Kit sichert, auf
  einem neuen Gerät entsperrt, Schlüssel erneuert, Notfallzugriff gibt, wann Kennwort sich selbst sperrt, wie man es als
  App installiert und was ohne Verbindung geht.
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

Verlässt jemand die Firma, wählt ein Inhaber (bei Mitarbeitern auch ein Admin) unter **Einstellungen
→ Mitglieder** neben der Person **Aus der Firma entfernen** und bestätigt. Inhaber können jeden
außer sich selbst entfernen, Admins nur Mitarbeiter. Der Server sperrt das Konto sofort: Alle
seine Geräte sind abgemeldet, und es kommt an nichts mehr heran, auch nicht mit einer Sitzung, die
es noch hat. Einladungslinks, die es verschickt hat und die noch niemand angenommen hat, gelten
nicht mehr. In der Mitgliederliste bleibt es als **Ausgetreten** stehen, denn seine Unterschriften
in den Tresoren müssen prüfbar bleiben.

Aus den Tresoren nimmt es danach das Gerät eines Verwalters, mit neuem Tresor-Schlüssel und
markierten Passwörtern (siehe [Wenn jemand geht](tresore.md#wenn-jemand-geht)): sofort das Gerät,
auf dem du entfernt hast, für die Tresore, die du verwaltest, und für alle anderen Tresore das
Gerät ihres Verwalters, sobald er Kennwort öffnet.

**Austritts-Bericht** neben einer ausgetretenen Person zeigt, was sie lesen konnte: je Tresor ihre
Rolle, seit wann und bis wann sie Mitglied war, und jeden Eintrag, den sie lesen konnte, mit den
Namen seiner geheimen Felder. Dein Gerät stellt den Bericht aus den Protokollen und Einträgen
zusammen, die es entschlüsseln kann; Tresore, in denen du nicht Mitglied bist, fehlen darin. Der
Server sieht den Bericht nie.

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
    öffnen. Davor schützt erst, [alle Schlüssel zu erneuern](#schlussel-erneuern).

Auf deinem bekannten Gerät bleibt der Secret Key gleich, deine anderen Geräte entsperren also mit
der neuen Passphrase weiter. Auf einem fremden Gerät bekommst du einen neuen Secret Key; deine
anderen Geräte brauchen ihn dann zusammen mit der neuen Passphrase.

## Schlüssel erneuern

Ist dein Recovery-Kit in fremde Hände geraten, erneuerst du unter **Einstellungen → Schlüssel
erneuern** alle Schlüssel deines Kontos. Danach öffnen das alte Kit, dein alter Recovery Key und
alles, was jemand mit ihnen kopiert hat, nichts mehr, was ab jetzt geschrieben wird.

1. Gib deine Passphrase noch einmal ein und wähle **Schlüssel jetzt erneuern**. Die Passphrase
   bleibt; du bekommst einen neuen Secret Key, einen neuen Recovery Key und neue Schlüssel.
2. Kennwort zeigt dein neues Recovery-Kit. Speichere es als PDF und bewahre es sicher auf; das alte
   kannst du vernichten.
3. Darüber steht ein **Vergleichscode** aus 60 Ziffern. Zeig ihn einem Inhaber oder Admin, am besten
   persönlich oder am Telefon. Er findet dich unter **Mitglieder** mit **Neue Schlüssel prüfen**,
   vergleicht den Code und wählt nur dann **Code stimmt**, wenn jede Ziffer gleich ist. Bist du
   selbst Inhaber oder Admin, bestätigt Kennwort deine neuen Schlüssel gleich selbst.
4. Bis dahin liest du deine Tresore weiter, aber niemand ändert dort etwas: Ein Hinweis oben sagt,
   dass jemand neue Schlüssel hat. Danach bekommt jeder Tresor, in dem du bist, von selbst einen
   neuen Schlüssel, und alles ist wieder wie vorher.

Was sonst passiert:

- Deine anderen Geräte werden abgemeldet. Verbinde sie neu über **Mit einem anderen Gerät
  verbinden** oder mit dem neuen Recovery-Kit; der alte Secret Key passt nicht mehr. Auch Passkeys,
  die zu deinem Konto angemeldet sind, werden gelöscht: Wer das alte Kit hatte, könnte einen eigenen
  angelegt haben.
- Freigaben einzelner Einträge und Notfallzugriffe, die du gegeben hast, gelten nicht mehr; gib sie
  neu. Wer mit dem alten Kit deine alten Schlüssel hat, könnte sonst in deinem Namen welche fälschen.
  Ebenso enden Freigaben und Notfallzugriffe an dich; die anderen geben sie dir neu.
- Ist die Firmen-Recovery an, hinterlegt dein Gerät deinen neuen Zugang gleich wieder.
- Bist du Inhaber oder Admin, hatte das alte Kit auch Zugang zum Firmen-Wurzelschlüssel und, als
  Inhaber, zum Recovery-Schlüssel der Firma. Lege unter **Mitglieder** einen neuen
  Recovery-Schlüssel an.

Wie das geschützt ist, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-12-recovery-kit).

## Firmen-Recovery

Hast du Passphrase, Recovery-Kit und Geräte zugleich verloren, holt dich ein Inhaber deiner Firma
zurück – wenn die Firma Firmen-Recovery eingeschaltet hat.

**Einschalten (Inhaber).** Unter **Einstellungen → Mitglieder → Firmen-Recovery** schaltet ein
Inhaber sie mit **Firmen-Recovery einschalten** ein. Sein Gerät erzeugt dafür einen
Recovery-Schlüssel, gibt ihn verschlüsselt jedem Inhaber und nennt ihn in den signierten
Firmen-Richtlinien. **Firmen-Recovery ausschalten** löscht Schlüssel und alle Hinterlegungen auf dem
Server.

**Hinterlegen (alle).** Ist sie an, hinterlegt jedes Gerät beim Entsperren den Schlüssel deines
Kontos verschlüsselt für den Recovery-Schlüssel, und nur für den, den die signierten Richtlinien
nennen. Unter **Firmen-Recovery** steht dann **Dein Zugang ist hinterlegt.** Meldet Kennwort dort,
der Server liefere einen anderen Schlüssel, wurde nichts hinterlegt: Sag einem Inhaber Bescheid.

**Wiederherstellen.**

1. Wähle auf einem neuen Gerät **Alles verloren? Über die Firma wiederherstellen**. Es zeigt einen
   QR-Code und darunter einen Link.
2. Ein Inhaber scannt den Code mit seinem entsperrten Gerät oder fügt den Link unter
   **Einstellungen → Gerät hinzufügen** ein, wählt unter **Gerät für** „*Name* wiederherstellen“ und
   tippt **Verbinden**.
3. Beide Geräte zeigen einen sechsstelligen Code. Vergleicht ihn – am besten nebeneinander oder am
   Telefon. Nur wenn er gleich ist: auf deinem Gerät **Code stimmt**, beim Inhaber
   **Code stimmt – Zugang wiederherstellen**.
4. Wähle eine neue Passphrase. Du bekommst einen neuen Secret Key und ein neues Recovery-Kit;
   speichere es wie beim Anlegen.

Dein Gerät prüft, dass es wirklich dein Konto bekommt: vom Wurzelschlüssel der Firma bestätigt und
mit genau dem Stand, den der Inhaber gesehen hat. Einen Zugang, den der Server selbst verpackt,
lehnt es ab. Jede Wiederherstellung steht signiert im Audit-Log.

**Wenn ein Inhaber geht.** Er hatte den Recovery-Schlüssel. Entfernt ein Inhaber einen anderen
Inhaber oder nimmt ihm die Rolle, legt Kennwort sofort einen neuen Recovery-Schlüssel an, und alle
hinterlegen beim nächsten Entsperren neu. Von Hand geht das mit **Neuen Recovery-Schlüssel
anlegen**. Was der Gehende schon öffnen konnte, schützt erst ein Wechsel des Account Key (ein
späterer Teil von K-307).

## Notfallzugriff

Wenn dir etwas zustößt, kann eine Person deines Vertrauens aus der Firma nach einer Wartezeit an
deine Einträge, ähnlich wie beim Notfallzugriff von Bitwarden. Unter **Einstellungen →
Notfallzugriff**:

1. Wähle unter **Notfallzugriff geben** eine **Person**. Angeboten werden nur Mitglieder, die
   **Bestätigt** sind.
2. Wähle den **Umfang**: **Ansehen** für ausgewählte Tresore oder **Vollzugriff** für das ganze
   Konto, auch deinen persönlichen Tresor.
3. Wähle eine **Wartezeit** zwischen einem Tag und 30 Tagen und dann **Notfallzugriff geben**.

Dein Gerät verschlüsselt die Schlüssel für genau diese Person und unterschreibt die Freigabe; der
Server kann die Schlüssel nicht öffnen und keine eigenen unterschieben.

**Wenn die Person anfragt**, siehst du das unter **Von dir gegeben** und als Hinweis oben auf jeder
Seite, mit dem Tag, an dem die Wartezeit endet. Bis dahin kannst du **Widersprechen**: Diese
Anfrage bleibt dann gesperrt, und die Person muss neu anfragen, mit neuer Wartezeit. Mit **Jetzt
freigeben** gibst du den Zugriff sofort frei. **Notfallzugriff zurückziehen** beendet die Freigabe.
Änderst du die Freigabe (oder erneuert dein Gerät sie nach einem Schlüsselwechsel), endet eine
laufende Anfrage; die Person fragt dann neu an.

**Wer Notfallzugriff hat**, sieht ihn unter **Für dich** und wählt im Notfall **Zugriff anfragen**.
Nach der Wartezeit, oder sobald der Gebende freigibt, öffnet **Öffnen** die Tresore zum Lesen. Dein
Gerät prüft vorher, dass der Gebende genau das unterschrieben hat, dass deine Anfrage nicht
widersprochen wurde und dass jeder Schlüssel zum Protokoll seines Tresors passt; jede Öffnung steht
im Audit-Log.

!!! note "Was du wissen solltest"
    - Die Wartezeit zählt der Server. Ein Server, der lügt, könnte sie verkürzen, aber nur für die
      Person, die du selbst gewählt hast.
    - Ansehen gilt für die Schlüssel, die die Tresore gerade haben. Nach einem Schlüsselwechsel
      erneuert dein Gerät den Notfallzugriff beim nächsten Öffnen von selbst.
    - Vollzugriff gibt der Person den Schlüssel deines Kontos. Nimmst du ihn zurück, nachdem sie ihn
      schon geöffnet hat, hilft erst ein neuer Kontoschlüssel.
    - Verlässt du oder die Person die Firma, endet der Notfallzugriff.

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

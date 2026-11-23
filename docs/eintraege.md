---
title: Einträge
description: >-
  Wie Kennwort Zugänge in Tresoren speichert: die Arten von Einträgen und eigene Felder, einen
  Eintrag anlegen, ändern und einzeln teilen, frühere Passwörter, Favoriten, Tags, die Suche und
  „Zum Ändern“, Passwörter und Passphrasen erzeugen, was ein Gerät prüft, bevor es einen Eintrag
  zeigt, und was der Server davon sieht.
---

# Einträge

Ein Eintrag ist etwas, das die Firma geheim halten will, etwa der Online-Banking-Login, das
WLAN-Passwort oder die Firmenkarte. Er liegt in genau einem Tresor; wer dort Mitglied ist, sieht
ihn.

## Arten von Einträgen

Jede Art bringt ihre Felder mit:

| Art | Felder |
| --- | --- |
| Login | Benutzername, Passwort, Website, Einmalcode |
| Notiz | Notiz (mehrzeilig) |
| WLAN | Netzwerkname, Passwort, Sicherheit |
| Karte | Karteninhaber, Kartennummer, Gültig bis, Prüfnummer, PIN |
| SSH-Schlüssel | Privater Schlüssel, Öffentlicher Schlüssel, Passphrase |
| API-Schlüssel | Schlüssel, Adresse |
| Identität | Name, E-Mail, Telefon, Anschrift |

Geheime Felder – Passwort, Kartennummer, Prüfnummer, PIN, Schlüssel – zeigt Kennwort als Punkte,
bis du sie aufdeckst. In der Liste steht unter dem Titel das erste ausgefüllte Feld, das nicht
geheim ist, etwa der Benutzername oder der Netzwerkname.

**Eigene Felder:** Mit **Feld hinzufügen** bekommt ein Eintrag weitere Felder mit eigenem Namen
und einer Art: Text, Geheim, Adresse (URL), E-Mail, mehrzeiliger Text oder Einmalcode (TOTP). Ein eigenes Feld
entfernst du mit dem Papierkorb daneben; ein neues Feld, dem du keinen Namen gibst, speichert
Kennwort nicht.

## Einmalcodes (TOTP)

Viele Dienste verlangen beim Anmelden einen zweiten Faktor: einen sechsstelligen Code, der alle
30 Sekunden wechselt. Kennwort erzeugt diese Codes selbst. Beim Einrichten zeigt der Dienst einen
QR-Code und meist auch einen Schlüssel zum Abtippen. Neben dem Feld **Einmalcode** des Logins
öffnet **QR-Code scannen** zwei Wege: **Kamera verwenden** (am Handy die Kamera auf der Rückseite)
oder **Bild wählen**, etwa einen Screenshot der Einrichtungsseite; ein Bild aus der
Zwischenablage kannst du auch einfügen. Das Bild bleibt auf deinem Gerät. Du kannst den Schlüssel
oder den `otpauth://`-Link auch selbst eintragen. Passt er nicht, sagt Kennwort das sofort.

Im Eintrag steht dann statt des Schlüssels der aktuelle Code und wie viele Sekunden er noch gilt.
**Einmalcode kopieren** legt den Code in die Zwischenablage, nie den Schlüssel. Der Schlüssel ist
ein Feld des Eintrags wie das Passwort: auf deinem Gerät verschlüsselt, für den Server unlesbar.
Die Codes rechnet dein Gerät aus (RFC 6238, mit SHA-1, SHA-256 oder SHA-512, sechs bis acht
Stellen); es braucht dafür nur eine richtig gehende Uhr.

Wer einen Eintrag lesen darf, sieht auch seine Codes. Liegen Passwort und Einmalcode im selben
Eintrag, schützt der zweite Faktor nicht mehr vor dem, der Kennwort öffnet, wohl aber vor jedem,
der nur das Passwort kennt.

## Einen Eintrag anlegen

In der Liste der Einträge öffnet **Neu** das Formular **Neuer Eintrag** rechts neben der Liste, am
Handy als eigener Screen. Du wählst den Tresor –
angeboten werden nur Tresore, in denen du bearbeiten oder verwalten darfst – und die Art, gibst
den Titel und die Felder ein und wählst **Speichern**. Wechselst du die Art, bevor du speicherst,
bleiben Titel, eigene Felder und Felder, die beide Arten haben (etwa das Passwort), erhalten; was
du in ein Feld geschrieben hast, das die neue Art nicht kennt, wird ein eigenes Feld. Kennwort
verschlüsselt den Eintrag auf deinem Gerät und zeigt ihn danach an.

## Einen Eintrag ändern

In einem Eintrag öffnet **Bearbeiten** dasselbe Formular an Ort und Stelle, mit den bisherigen
Werten. Unten bleibt die Leiste mit **Abbrechen** und **Speichern** stehen; Esc bricht ab,
Strg+Enter (am Mac Cmd+Enter) speichert. Hast du etwas geändert, fragt Kennwort vor dem Verlassen,
ob es die Änderungen verwerfen soll. Die Art eines
gespeicherten Eintrags bleibt. Jede Änderung
wird eine neue Version; frühere Versionen bleiben auf dem Server erhalten. Haben zwei Geräte
denselben Eintrag gleichzeitig geändert, führt Kennwort beide Stände zusammen, ohne einen
stillschweigend zu verwerfen. In einem Tresor, in dem du nur lesen darfst, ist **Bearbeiten**
ausgegraut.

Erreicht dein Gerät den Server gerade nicht, sagt Kennwort das; die Änderung wartet auf dem Gerät,
bis du es wieder versuchst.

### Frühere Passwörter

Änderst du ein Passwort oder ein anderes geheimes Feld, merkt sich der Eintrag den alten Wert mit
dem Tag der Änderung. Im Eintrag stehen sie unter **Frühere Passwörter**, das neueste zuerst, als
Punkte, bis du eines aufdeckst; kopieren kannst du sie wie das Passwort selbst. So kommst du noch
an ein Konto, wenn eine Änderung beim Dienst nicht geklappt hat.

Ein Eintrag behält je Feld die letzten zehn Werte; ein älterer fällt bei der nächsten Änderung
weg. Leerst du ein geheimes Feld, kommt sein Wert ebenfalls dazu; entfernst du ein eigenes Feld
ganz, nimmt es seine früheren Werte mit. Die früheren Werte liegen im selben Geheimtext wie der
Eintrag: Wer den Eintrag lesen darf, sieht auch sie, der Server keinen davon. Den Schlüssel eines
Einmalcodes zeigt Kennwort auch hier nie.

Haben zwei Geräte dasselbe Feld gleichzeitig geändert, kommt der Wert, der nicht bleibt, ebenfalls
in die früheren Werte des Eintrags; geheime Felder zeigt Kennwort davon unter
**Frühere Passwörter**.

## Favoriten und Tags

Der Stern im Eintrag macht ihn zum **Favoriten**; in der Seitenleiste (am Handy als Filter über
der Liste) zeigt **Favoriten** nur diese Einträge. Der Favorit gehört zum Eintrag, nicht zu dir:
Wer im Tresor Mitglied ist, sieht dieselben Favoriten, und markieren kann nur, wer dort bearbeiten
oder verwalten darf. Für die anderen ist der Stern ausgegraut. Eigene Favoriten für jede Person
sind noch nicht gebaut.

**Tags** fasst Einträge über Tresore hinweg zusammen, etwa „Steuer“ oder „Baustelle“. Du
vergibst sie beim Bearbeiten des Eintrags unter **Tags**: einen Namen eingeben und Enter oder
**Tag hinzufügen**; das Kreuz am Tag entfernt ihn wieder. Im Eintrag stehen die Tags unter dem
Titel, und die Suche findet einen Eintrag auch über seine Tags. Groß- und Kleinschreibung zählt
dabei nicht: „Büro“ und „büro“ sind derselbe Tag.

## Suchen

Die Suche über der Liste (Taste `/`) findet Einträge über den Titel, die Art (etwa „WLAN“), die
Tags und den Inhalt jedes Felds, das nicht geheim ist: Benutzername, Website, E-Mail, Notizen,
eigene Textfelder. Groß- und Kleinschreibung und Akzente zählen nicht, „buro“ findet „Büro“ und
„strasse“ findet „Straße“. Passwörter, andere geheime Felder, frühere Passwörter und Schlüssel von
Einmalcodes durchsucht Kennwort nie; wer ein Passwort eintippt, erfährt so nicht, in welchem
Eintrag es steht. Die Suche läuft auf deinem Gerät, der Server sieht sie nicht.

## Zum Ändern

**Zum Ändern** sammelt Einträge, deren Passwort schwach ist oder in mehr als einem Eintrag steht,
den du sehen kannst, und Einträge, deren geheime Felder jemand lesen konnte, der den Tresor
verlassen hat; die Seitenleiste zeigt, wie viele es sind, am Handy der Filter „Zum Ändern · N“. In
der Liste tragen sie den Hinweis „ändern“, und im Eintrag steht, warum: „Das Passwort ist schwach
…“, „Dasselbe Passwort steht in N Einträgen.“ oder „Anna hatte Zugriff bis 20.11.2026. Ändere:
Passwort.“ Sobald du das Passwort änderst, verschwindet der Eintrag aus der Liste.

Den Hinweis auf jemanden, der gegangen ist, setzt das Gerät, das nach dem Austritt den
Tresor-Schlüssel wechselt ([Wenn jemand geht](tresore.md#wenn-jemand-geht)), und danach jedes
Gerät, das einen Eintrag aus der Zeit vor dem Austritt ändert. Er steht verschlüsselt im Eintrag
selbst, alle Mitglieder sehen ihn, und er bleibt bei jeder anderen Änderung erhalten. Jedes Feld
geht aus ihm heraus, sobald sein Wert sich ändert; mit dem letzten Feld verschwindet der Hinweis.
Einen PIN oder einen TOTP-Schlüssel nennt er ebenso wie ein Passwort.

Geprüft werden die Passwörter von Logins und WLAN und die Passphrase eines SSH-Schlüssels. Eine
PIN, eine Prüfnummer oder ein API-Schlüssel ist kurz oder vom Dienst vorgegeben; die prüft
Kennwort nicht, ebenso wenig eigene geheime Felder.

Als **schwach** gilt ein Passwort,

- das in einer Liste der 1000 häufigsten Passwörter steht, auch mit Ziffern oder Zeichen davor
  oder dahinter und in beliebiger Schreibung („Password1!“ wie „password“), oder
- das nach Länge und Art der Zeichen unter 60 Bit kommt, der Grenze des Generators. Dabei zählt
  jede Art von Zeichen, die vorkommt (Klein- und Großbuchstaben, Ziffern, Sonderzeichen,
  Umlaute), und eine Folge desselben Zeichens nur einmal.

Das ist eine grobe Schätzung. Die Liste stammt aus englischsprachigen Datenlecks; deutsche Wörter
wie „Passwort“ oder „Hallo“, Namen, die deutsche Tastaturreihe „qwertz“ oder Daten erkennt sie
nicht. „Sommer2019“ fällt nur wegen seiner Länge auf, „Sommer2019!xyz“ nicht. Ein Passwort, das hier nicht auftaucht, ist darum nicht
sicher stark; der Generator macht eines, das es ist. Ob ein Passwort in einem Datenleck
aufgetaucht ist, prüft auf Wunsch die [Sicherheits-Übersicht](sicherheit.md#prufung-gegen-datenlecks).

**Doppelt** ist ein Passwort, das genau so in mindestens einem anderen Eintrag steht, auch in
einem, der mit dir geteilt ist. Dein Gerät vergleicht die entschlüsselten Einträge im Speicher,
jedes Mal, wenn sie sich ändern. Weder die Passwörter noch Prüfsummen davon noch das Ergebnis
gehen an den Server oder werden gespeichert; ein anderes Mitglied sieht seine eigene Liste, je
nachdem, welche Einträge es lesen kann.

## Einen einzelnen Eintrag teilen

Manchmal braucht jemand aus der Firma nur einen Zugang aus einem Tresor, nicht den ganzen Tresor.
Dann wählst du im Eintrag **Teilen**. Der Dialog zeigt, mit wem der Eintrag schon geteilt ist, und
bietet alle bestätigten Personen der Firma an, die nicht Mitglied des Tresors sind. Du wählst eine
Person, auf Wunsch einen letzten Tag, und **Teilen**. Teilen darf, wer im Tresor bearbeiten oder
verwalten darf; wer nur lesen darf, sieht **Teilen** ausgegraut.

Die Person kann den Eintrag nur lesen, nicht ändern und nicht weiter teilen. Sie sieht auch
spätere Änderungen, bis der letzte Tag vorbei ist oder du die Freigabe entfernst. Vom übrigen
Tresor sieht sie nichts, auch nicht seinen Namen.

**Entfernen** nimmt die Freigabe zurück. Kennwort verschlüsselt den Eintrag dabei mit einem neuen
Schlüssel neu und speichert ihn als neue Version; mit dem Schlüssel, den die Person hatte, öffnet
sich keine spätere Version mehr. Wer den Eintrag sonst noch geteilt bekommen hat, bekommt den
neuen Schlüssel automatisch. Erst danach verschwindet die Freigabe; klappt das Neuverschlüsseln
nicht, etwa weil der Server nicht erreichbar ist, bleibt sie stehen, und du entfernst sie einfach
noch einmal. Was die Person vorher lesen konnte, kennt sie weiter: Ändere das Passwort, wenn das
nicht so bleiben soll.

### Mit mir geteilt

Was andere mit dir geteilt haben, steht in der Seitenleiste unter **Mit mir geteilt**, am Handy
als eigener Filter über der Liste. Diese Einträge erscheinen nicht unter „Alle Einträge“; im
Eintrag steht, wer ihn geteilt hat, und **Bearbeiten** und **Teilen** sind ausgegraut. Bevor
Kennwort einen geteilten Eintrag zeigt, prüft dein Gerät, dass ihn jemand aus deiner Firma mit
zertifiziertem Schlüssel an dich geteilt hat, dass der Schlüssel dazu passt und dass er nicht
älter ist als eine Version, die du schon gesehen hast. Eine Freigabe, die entfernt wurde, zeigt
es nicht mehr. Wie das geschützt ist und wo Grenzen bleiben, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-10-einzelnen-eintrag-teilen).

## Passwörter und Passphrasen erzeugen

Der **Generator** erzeugt auf deinem Gerät ein zufälliges Passwort oder eine Passphrase:

- **Passwort**: 8 bis 64 Zeichen aus Klein- und Großbuchstaben, nach Wahl mit Ziffern und
  Sonderzeichen (`!#$%&*+-=?@^_`); von jeder gewählten Art ist mindestens ein Zeichen dabei.
- **Passphrase**: 3 bis 10 Wörter aus der Wortliste der Electronic Frontier Foundation (7776
  englische Wörter), getrennt durch Bindestrich, Punkt, Unterstrich oder Leerzeichen, nach Wahl
  groß beginnend und mit einer angehängten Ziffer.

Unter dem Ergebnis steht, wie stark es ist, in Bit: so viele Ja-Nein-Fragen müsste jemand
erraten, der deine Einstellungen kennt. Unter 60 Bit gilt als schwach, ab 80 Bit als stark; ein
Passwort mit 20 Zeichen und allen Arten hat 124 Bit, eine Passphrase aus fünf Wörtern 64 Bit.
**Neu erzeugen** würfelt neu, **Kopieren** legt das Ergebnis in die Zwischenablage.

Kennwort merkt sich auf diesem Gerät die Einstellungen, nie ein erzeugtes Passwort. Im Dialog
eines Eintrags füllt **Passwort erzeugen** (bei SSH-Schlüsseln **Passphrase erzeugen**) das Feld
mit den zuletzt gewählten Einstellungen für Passwörter.

## Was dein Gerät prüft

Bevor Kennwort einen Eintrag zeigt, prüft dein Gerät, dass ihn ein Mitglied mit dem Recht zu
bearbeiten signiert hat, dass er zu diesem Tresor und dieser Stelle gehört und dass er nicht
älter ist als eine Version, die das Gerät schon kannte. Einen Eintrag, der nicht passt, zeigt es
nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-09-eintrage-speichern-und-lesen).

Der Server bekommt nur Geheimtexte: Er sieht, dass es einen Eintrag gibt, wie groß er ist und wann
er sich geändert hat, aber weder Titel noch Benutzername, Passwort oder Website. Einträge und
ihre Änderungen gibt er nur an Mitglieder des Tresors und einen geteilten Eintrag an die Person,
mit der er geteilt ist.

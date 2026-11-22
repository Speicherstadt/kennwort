---
title: Projektplan
description: >-
  Der Plan für Kennwort: Ziel, Entscheidungen, Stack, Kryptografie, Bedrohungsmodell, Bauplan im
  Agenten-Loop, Tests und Funktionsumfang 1.0.
---

# Projektplan

Ein selbst gehosteter Passwortmanager für Teams in kleinen Betrieben: Web-App und Browser-Extension,
Ende-zu-Ende-verschlüsselt, post-quanten-hybrid, sicher auch gegen einen gehackten Server. Passt in
die Speicherstadt-Suite, kennt aber keine andere App: Anmeldung über OpenID Connect, ohne
Pro-Version. Was im Einzelnen gebaut wird und in welcher Reihenfolge, steht in der
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md).

## Ziel und Positionierung

Kennwort (kennwort.app) wird der Passwortmanager der Speicherstadt-Suite: für Betriebe mit 3 bis 50
Mitarbeitern, die gemeinsame Zugänge (Banking, Lieferantenportale, WLAN, Kundengeräte) heute in
Excel, auf Zetteln oder in einem Abo-Tool verwalten.

Was Kennwort anders macht als Passbolt und Bitwarden:

- **Server darf bösartig sein**: signiertes Mitgliedschafts-Log und signierte Schlüssel; die 27
  Angriffe der ETH-Studie (2026) werden als Regressionstests nachgebaut.
- **Post-quanten-hybrid** (X25519 + ML-KEM-768) von Anfang an.
- **Entsperren mit Passkey** (WebAuthn PRF), Passphrase nur als Notweg.
- **Eine Anmeldung über OpenID Connect**: in der Suite über Kontext oder Stalwart, sonst jeder
  Anbieter (Keycloak, Authentik, Entra ID); Gruppen kommen aus dem groups-Claim, wer geht, verliert
  den Zugriff.
- **Alles frei**: SSO, Gruppen, Audit-Log ohne Pro-Version (AGPL).
- **Ein Container, Bun + SQLite**, wenige Abhängigkeiten (Client: etwa 6 Laufzeitpakete).

Nicht das Ziel: Konkurrenz zu Bitwarden für Privatleute oder Großunternehmen (LDAP/SCIM erst
später).

## Entscheidungen

| Frage | Entscheidung | Warum |
| --- | --- | --- |
| Firmen-Recovery | Standard für Firmen, pro Firma abschaltbar: Der Inhaber hält einen Notfallschlüssel und kann den Zugang eines Mitarbeiters wiederherstellen | Für einen kleinen Betrieb ist „alles weg“ schlimmer als „der Chef kommt im Notfall ran“; geteilte Tresore haben ohnehin mehrere Mitglieder |
| Betrieb | Selbst gehostet, aber von Anfang an mandantenfähig, sodass ein IT-Dienstleister viele Firmen auf einem Server betreiben kann | passt zu „mehrere Firmen“; da der Server nichts lesen kann, ist auch gehosteter Betrieb unbedenklich |
| Einrichtungs-Code | Der Code des Betreibers legt jede neue Firma an, nicht nur die erste; eine bestehende Firma öffnet er nie | passt zum mandantenfähigen Betrieb: Ein IT-Dienstleister legt viele Firmen an, ohne den Server neu zu starten; in eine Firma kommt man weiter nur mit Einladung |
| Router und Server-Daten der Web-App | TanStack Router (`@tanstack/solid-router` 2.0.0-rc.11) und TanStack Query (`@tanstack/solid-query` 6.0.0-rc.6), auf Wunsch des Nutzers als Release Candidates übernommen, exakt gepinnt. Der Router läuft ohne `RouterProvider` mit Routen im Code (keine Codegen): Er hält Adresse und Verlauf, die App liest die Seite aus seinem Treffer und bleibt beim Sperren der Torwächter. Query lädt Geräte, Gruppen, Mitglieder und Richtlinie: ein Cache je geöffnetem Konto, nur im Speicher, beim Sperren geleert, ohne Persister, Schlüssel ohne Token oder Geheimnis. Tresore und Einträge bleiben beim eigenen Laden, weil sie entschlüsseln und den Sync speisen | Nur diese Versionen tragen Solid 2. Risiko: Der Router hängt laut Paket noch an `@solidjs/meta`, `@solid-primitives/refs` und `@solid-devtools/logger` (für Solid 1) und `isbot`; keins davon landet im Bundle (geprüft mit der Source Map), es gibt nur ein `solid-js`. Beide zusammen machen das Bundle der Web-App um rund 153 kB größer (53 kB gzip), vor allem `router-core` und `query-core`. Fragmente mit Geheimnissen (Kit, Kopplung) liest die App vor dem ersten Rendern und entfernt sie sofort aus Adresse, Verlauf und Router |
| Secret Key auf dem Gerät | Die Web-App merkt sich Konto-ID und Secret Key im `localStorage`, nie Passphrase oder AK | wie bei 1Password: Zum Entsperren reicht die Passphrase, und ein Server, der Passphrasen errät, muss trotzdem den Secret Key raten |
| Neues Gerät | Der QR-Code trägt Kopplungs-ID, Fingerabdruck des Einmal-Schlüssels und ein Kopplungs-Geheimnis, nicht den Schlüssel; das Paket ist an das Geheimnis gebunden und enthält auch den Secret Key | Ein X-Wing-Schlüssel hat 1216 Byte, der QR-Code bliebe kaum lesbar, und der Fingerabdruck bindet ihn genauso; das Geheimnis sieht der Server nie, so kann er kein eigenes Paket unterschieben (Review von K-303); ohne Secret Key könnte das neue Gerät nach dem Sperren nicht mit der Passphrase entsperren |
| Icons | `lucide` (die Icon-Daten ohne Framework) mit einer eigenen Icon-Komponente in `packages/ui` statt `lucide-solid` | `lucide-solid` baut auf Solid 1 (`splitProps`, `solid-js/web`) und läuft mit Solid 2 nicht; die Daten sind dieselben, und eine Abhängigkeit weniger läuft im Client |
| Lizenz | AGPL-3.0 mit Namensnennung nach § 7(b) und kommerzieller Lizenz wie bei haben, dazu ein kurzes CLA für Beitragende | erlaubt die iPhone-App im App Store und die kommerzielle Lizenz trotz Beiträgen von außen |
| Merge | Der Agenten-Loop merged alles selbst, wenn CI grün ist; er wartet nie auf einen Menschen. Ein unabhängiges Review durch einen eigenen Sub-Agenten gibt es nur noch für sicherheitsrelevanten Code (Kryptografie, Sync, Mitglieder-Log, Freigaben, Anmeldung, Zugriffsprüfung, Entsperren, Schlüssel, Kopplung, Autofill, signiertes Update, CSP, erlaubte Pakete), und dort erst ohne offene Befunde | der Loop soll ohne Warten durchlaufen; ein Review für jeden Pull Request kostete zu viel Zeit, deshalb gilt es seit dem 20.11.2026 auf Wunsch des Nutzers nur noch dort, wo ein Fehler Geheimnisse kostet |
| Geräte und Sitzungen | Jedes Gerät schickt eine zufällige Geräte-ID und einen Namen aus dem Browser mit; der Server hält pro Gerät und Konto genau eine Sitzung, die Geräteliste zeigt diese Sitzungen | Better Auth kennt nur Sitzungen; ohne Geräte-ID würde jede Anmeldung eine neue Zeile in der Liste, und „Gerät abmelden“ träfe nur eine von mehreren Sitzungen desselben Geräts |
| Einladungsgeheimnis | Der Client des Einladenden hinterlegt das Einladungsgeheimnis versiegelt unter seinem eigenen AK auf dem Server; eine Einladung macht immer einen Mitarbeiter, eine höhere Rolle vergibt ein Inhaber eigens | So prüft der Einladende die Antwort auch Tage später und auf jedem seiner Geräte, ohne dass der Server das Geheimnis kennt; und kein Server kann einen Eingeladenen als Inhaber zertifizieren lassen |
| Namen der Mitglieder | Der Einladende tippt einen Namen ein; der Server speichert ihn an der Einladung und zeigt ihn in der Mitgliederliste | Konten haben sonst keine Namen, bis OIDC oder SCIM sie liefern; der Name ist nur eine Beschriftung, Vertrauen kommt allein aus dem Zertifikat |
| Wurzelschlüssel für Admins | Inhaber und Admins halten den privaten Wurzelschlüssel, verpackt an ihr Bündel; nur Inhaber vergeben Rollen, nie die eigene | Admins laden ein und müssen dafür zertifizieren können (P-08); ein Inhaber, der sich nicht selbst herabstufen kann, hält die Firma immer mit mindestens einem Inhaber |
| Firmen-Richtlinie | Eine vom Wurzelschlüssel signierte Richtlinie mit Version (F-07); Clients merken sich die höchste Version und nehmen keine ältere | So kann der Server weder die Sperrzeit noch später die Firmen-Recovery heimlich ändern oder zurückdrehen |
| Gruppen nach den Anfragen | Zugriff anfragen kommt vor den Gruppen (K-305); eine Gruppe erzeugt beim Eintritt eines Mitglieds nur Anfragen an die Verwalter ihrer Tresore | Bei Ende-zu-Ende-Verschlüsselung gibt nur ein Verwalter-Client Zugriff; Gruppen bauen darum auf den Anfragen auf, nicht umgekehrt |
| Einzelnen Eintrag teilen nach den Einträgen | K-305 Teil 6 (P-10) kommt nach K-306 Teil 1; der Eintrags-Schlüssel bleibt seitdem über die Versionen eines Eintrags gleich, neu bei Schlüsselwechsel und Widerruf | Vorher bekam jede Version einen neuen EK; eine Freigabe soll aber auch spätere Versionen öffnen, und erst ein Widerruf wechselt den EK |
| Widerruf einer Freigabe | Entfernen holt den Tresor neu, schreibt den Eintrag mit unverändertem Inhalt als neue Version unter einem neuen EK, verpackt den neuen EK für die übrigen Freigaben neu und löscht die Freigabe erst danach; neu gemacht werden nur Freigaben, die ein Mitglied mit „bearbeiten“ oder „verwalten“ über den EK der ersetzten Version signiert hat | Erst der neue EK nimmt dem Entfernten spätere Versionen (P-10); ohne neues Verpacken würden die übrigen Freigaben brechen, ohne die Prüfung gegen den neuesten EK könnte ein Server eine eigene oder früher widerrufene Freigabe neu verpacken lassen, und weil zuletzt gelöscht wird, bleibt ein gescheiterter Widerruf wiederholbar (Review von K-305 Teil 6b) |
| Versionen geteilter Einträge | Der Empfänger merkt sich die höchste Version jedes geteilten Eintrags im verschlüsselten Kontostand (`versions`) und zeigt keine ältere | So spielt ihm der Server auch ohne Log keinen älteren Stand ein, über Geräte und Sitzungen hinweg (E-13) |
| „Mit mir geteilt“ getrennt | Geteilte Einträge stehen nur unter „Mit mir geteilt“, nicht unter „Alle Einträge“ oder in einem Tresor | Der Empfänger ist kein Mitglied des Tresors; die Liste zeigt klar, was nur geliehen und nur lesbar ist |
| Rolle einer Freigabe | Eine Freigabe trägt ihre Rolle im signierten Format, vorerst nur „lesen“ | Wer einen einzelnen Eintrag bekommt, hat kein Log, in dem eine Schreibberechtigung stünde; „bearbeiten“ kann später kommen, ohne das Format zu ändern |
| Persönlicher Tresor | Jedes Konto bekommt beim ersten Öffnen einen Tresor „Persönlich“, dessen ID aus dem AK abgeleitet ist | Ein Ort für eigene Zugänge ohne Zutun; dieselbe ID auf allen Geräten verhindert doppelte Tresore |
| Schlüsselwechsel beim Austritt | `entfernen` und `schlüsselwechsel` signiert derselbe Verwalter in einem Zug; das neue VK geht an jedes Mitglied, das das Log danach noch nennt, auch an abgelaufene, und nur über ein Zertifikat des Wurzelschlüssels mit dem Fingerabdruck aus dem Log, sonst bricht der Wechsel ab; jeder Eintrag wird als nächste Version in der neuen Epoche geschrieben | Was nach dem Austritt geschrieben wird, liegt so unter einem Schlüssel, den die Person nie hatte (E-26); ein still ausgelassenes oder an einen fremden Schlüssel verpacktes Mitglied wäre schlimmer als ein abgebrochener Wechsel. Abgelaufene bekommen den Schlüssel, weil `rolle` sie wieder hereinlässt und keinen Schlüssel trägt; der Server gibt ihn nur aktuellen Mitgliedern |
| Epochen beim Lesen und Schreiben | Geschrieben wird nur unter dem Schlüssel der aktuellen Epoche des geprüften Logs (sonst schreibt der Abgleich nichts), der Server nimmt Versionen nur in dieser Epoche; ältere Schlüssel liest der Client nur für Versionen, die noch nicht neu verschlüsselt sind; eine Version einer Epoche, die das Log nicht erreicht, ist ein Angriff | Ein Gerät mit dem alten Schlüssel schriebe für jemanden, der gegangen ist; ein abgebrochener Wechsel soll den Tresor aber lesbar lassen. Neu verschlüsselte Einträge verraten einen zurückgehaltenen Wechsel oder ein zurückgespieltes Log auch einem Gerät, das sich den neueren Stand nie gemerkt hat |
| Epoche eines Eintrags nach dem Wechsel | Die Epoche eines Eintrags geht nie zurück: Eine neuere Version in einer älteren Epoche als der, in der das Gerät den Eintrag schon hat, lehnt der Client ab (`older-epoch`), ebenso die Offline-Kopie; eine offline gewartete Änderung wird erst beim Abgleich unter dem aktuellen Schlüssel versiegelt, nie ein alter Geheimtext übernommen | Nur ein Schreiber, dem der Server den Wechsel vorenthält, schreibt nach dem Wechsel noch in der alten Epoche; seine Versionen kann die ausgetretene Person lesen, und sie verdrängten die neu verschlüsselte Version mit ihren Markierungen. Eine Grenze nach der letzten bekannten Version je Epoche oder nach dem signierten Log (`zuletzt-gesehen`) unterscheidet ein vom Wechsel ferngehaltenes Mitglied nicht von einem ehrlichen Schreiben vor dem Wechsel und würde einen versteckten Eintrag unlesbar machen |
| Änderungs-Markierung | Im Inhalt des Eintrags (`toChange`: Konto, Zeit, IDs der geheimen Felder), gesetzt beim Neuschreiben nach dem Wechsel für Versionen aus einer Epoche, deren Schlüssel die Person hatte; ein Feld geht aus der Markierung, sobald sich sein Wert ändert; die Markierungen trägt der Kern von Version zu Version, nicht der Dialog | Verschlüsselt, signiert und für alle Mitglieder sichtbar, ohne neue Tabelle auf dem Server, der eine Markierung sonst still löschen könnte; ein Dialog, der sie nicht kennt, verliert keine. Wie Bitwarden und 1Password raten: ändern, was die Person sehen konnte |
| Austritt aus der Firma | `DELETE /api/members/:id` durch Inhaber (alle anderen) und Admins (nur Mitarbeiter) sperrt das Konto sofort: alle Sitzungen weg, keine Anfrage unter `/api` mehr; Schlüssel und Zertifikat bleiben; aus den Tresoren entfernen und den Schlüssel wechseln macht der nächste Verwalter-Client | Den Zugang zum Server kann der Server sofort nehmen, den zu den Schlüsseln nur ein Verwalter mit Signatur; ohne das Zertifikat ließen sich die Logs, die die Person signiert hat, nicht mehr prüfen |
| Austritt in Teilen | K-307 Teil a bringt Schlüsselwechsel, Markierung, Austritts-Bericht, Server und Angriffs-Tests ohne Oberfläche; Teil b die Oberfläche, die einen ausstehenden Wechsel sofort nachholt und Freigaben neu verpackt; Firmen-Recovery, Notfallzugriff, AK-Wechsel und neuer Wurzelschlüssel folgen als eigene Teile | Die Web-App zieht gerade auf TanStack Router und Query um; bis Teil b sieht der Client einen ausstehenden Wechsel (`rotationDue`), sperrt das Schreiben aber noch nicht, damit ein Entfernen in der heutigen Oberfläche den Tresor nicht für alle blockiert |
| Austritt in der Web-App | Entfernen aus Tresor und Firma macht immer den Schlüsselwechsel mit; ein Verwalter-Client holt nach jedem Laden der Tresore von selbst nach, was seine Tresore schulden (Ausgetretene laut Mitgliederliste, ein Wechsel ohne vorheriges Entfernen, Einträge einer älteren Epoche), immer nur ein Austritt zur Zeit; solange ein Wechsel aussteht, schreibt kein Client, und alle warnen; jedes Schreiben markiert gegen alle früheren Austritte des Logs (`exposures`) | Ein Entfernen ohne Wechsel ließe der Person den aktuellen Schlüssel; wer auf einen Klick des Verwalters wartet, wartet, bis er es vergisst. Eine Sperre nur beim Verwalter hielte die anderen nicht davon ab, unter dem alten Schlüssel zu schreiben. Die Markierung bei jedem Schreiben schließt die Lücke des versteckten Eintrags aus dem Review von Teil a. Preis: Ein Server, der fälschlich einen Austritt meldet, lässt den Verwalter-Client die Person entfernen (nimmt Zugriff, gibt keinen), und ohne Verwalter online bleibt ein Tresor nur lesbar |
| Name des Tresors beim Wechsel | Der Verwalter-Client versiegelt den Namen nach dem Wechsel unter dem neuen Schlüssel; jeder Client liest einen Namen mit dem Schlüssel seiner eigenen Epoche | Der Name war mit dem alten Schlüssel versiegelt, den die Person ohnehin hat; ohne neues Versiegeln stünde der Tresor nach dem Wechsel ohne Namen da (gefunden vom Playwright-Test) |
| Austritts-Bericht | Ein Dialog in den Mitgliedern neben jeder ausgetretenen Person, aus den Tresoren, die das Gerät öffnen kann | Der Verwalter, der jemanden entfernt, ist der, der die Passwörter ändern lassen muss; der Bericht braucht entschlüsselte Einträge und bleibt darum auf dem Gerät |
| Firmen-Recovery umgesetzt | Inhaber legen den Recovery-Schlüssel an und schalten ihn in der Richtlinie; jedes Konto hinterlegt AK nur an den Schlüssel, den die signierte Richtlinie nennt, signiert über Firma, Konto, Fingerabdruck, Bindung und Paket (F-08); wiederhergestellt wird über die Kopplung von P-04 mit einem eigenen Paket (`recovery-device`, ohne Secret Key), das neue Gerät legt neue Entsperr-Wege mit einem neuen Secret Key an, bewiesen mit dem Ed25519-Schlüssel des Kontos; geht ein Inhaber oder verliert die Rolle, legt der Client einen neuen Schlüssel an | Die Signatur über Fingerabdruck und Paket macht eine alte oder vom Server getauschte Hinterlegung für Inhaber und Konto erkennbar; die Kopplung bindet den AK an das Geheimnis im QR-Code, das der Server nie sieht; die Extension hinterlegt nicht, damit sie keine weiteren Aufrufe braucht – das tut die Web-App beim Entsperren |
| Notfallzugriff umgesetzt | Eine Freigabe je Paar aus Gebendem und Vertrauensperson, Umfang „Ansehen“ (VKₑ ausgewählter Tresore) oder „Vollzugriff“ (AK), Wartezeit ein bis 30 Tage; signiert wird über die Bindungen, nicht über die Pakete (F-09), Anfrage, Widerspruch, frühere Freigabe und Rücknahme sind eigene signierte Aussagen; der Client der Person zählt die Wartezeit nach der eigenen Uhr ab ihrer signierten Anfrage und merkt sich im Kontozustand die neueste Freigabe, Rücknahmen und Widersprüche; Ansehen-Freigaben erneuert der Client des Gebenden nach einem Schlüsselwechsel und der Server behält dabei eine laufende Anfrage; Benachrichtigung zunächst in der App (Hinweis über jeder Seite), Web-Push und Mail kommen mit K-602 | Wie Bitwardens „Emergency Access“ mit „View“ und „Takeover“, aber jeder Schlüssel muss zu einer Bindung passen, die der Gebende signiert hat, bei Tresoren auch zu der im Log; so prüft die Person die Freigabe, bevor der Server die Pakete herausgibt; eine eigene signierte Anfrage macht ein vorgezogenes Herausgeben für einen ehrlichen Client erkennbar, die gemerkten Rücknahmen und Widersprüche ein Zurückspielen; was bleibt, ist die Wartezeit selbst, die nur der Server durchsetzt (P-14) |
| AK-Wechsel nach verlorenem Recovery-Kit | Neuer AK, neuer Secret Key, neue Benutzer-Schlüssel und neuer Recovery Key; die Passphrase bleibt. Der Server ersetzt alles nur mit einer Signatur des bisherigen Ed25519-Schlüssels (F-11) und meldet die anderen Geräte ab; das neue Bündel bestätigt ein Inhaber oder Admin per Vergleichscode (60 Ziffern, F-04), ein Inhaber oder Admin mit Wurzelschlüssel sich selbst; danach in jedem Tresor ein Eintrag `schlüsselerneuerung` und ein Schlüsselwechsel ohne Markierung | Mit dem Kit öffnet ein Angreifer AK und damit die privaten Schlüssel und jeden je verpackten Tresor-Schlüssel; ein neuer AK allein schützte nichts, und der verratene alte Schlüssel kann den neuen nicht bezeugen (wie 1Password und Bitwarden: alles neu verschlüsseln, andere Geräte abmelden) |
| `schlüsselerneuerung` statt Entfernen und Aufnehmen | Ein eigener Log-Eintrag nennt das neue Bündel mit derselben Rolle und demselben Ablauf; das Mitglied signiert ihn mit dem neuen Schlüssel selbst, gleich mit welcher Rolle, sonst ein Verwalter | Der einzige Verwalter eines Tresors, im persönlichen Tresor immer die Person selbst, könnte sich nicht entfernen und wieder aufnehmen: Nach dem Entfernen wäre niemand mehr Verwalter |
| Neuer Wurzelschlüssel | Geht ein Inhaber oder Admin oder wird er Mitarbeiter, ersetzt der Client des Inhabers den Wurzelschlüssel sofort: Wechsel signiert vom alten und vom neuen (F-14, gebunden an Firma und alten Fingerabdruck), neue Zertifikate für alle, die bleiben, der neue Schlüssel an Inhaber und Admins verpackt, die Richtlinie neu signiert, alles in einem Schritt. Jeder andere Client nimmt den Wechsel erst, wenn die Person den Vergleichscode (60 Ziffern) mit einem Inhaber verglichen hat, merkt ihn im Kontozustand und im Schlüsselblock und nimmt nie einen zweiten vom alten Schlüssel; Zertifikate des alten gelten danach nur für vor dem Wechsel signierte Log-Einträge | Wer geht, behält eine Kopie des alten Schlüssels und kann jeden Wechsel selbst signieren; nur der Vergleich mit dem Inhaber unterscheidet den echten. Ohne Bestätigung könnte der Gegangene mit dem Server die Wurzel gabeln, mit einem automatischen Wechsel ohne Grenze für alte Zertifikate weiter Logs anhängen. Die Logs, die er vor dem Wechsel signiert hat, müssen aber weiter verifizieren |
| Zertifikate ersetzter Bündel | Der Server führt sie weiter (`superseded_certificates`, `previous` in der Mitgliederliste); ein solches Zertifikat gilt für Log-Einträge nur bis zur Ausstellung des nächsten, für Datensätze, solange das Log das alte Bündel nennt; solange ein Log ein ersetztes Bündel nennt, schreibt in dem Tresor niemand | Alte Logs und Datensätze müssen weiter verifizieren, der alte Schlüssel darf aber nichts Neues mehr signieren; wer ihn hat, kennt auch den aktuellen Tresor-Schlüssel |
| Freigaben und Notfallzugriffe nach einer Erneuerung | Der Server löscht die an das Konto und die vom Konto; die Person und ihre Kollegen geben sie neu, die Seite sagt das vorher | An das Konto sind sie an das alte Bündel verpackt; vom Konto trägt sie die Signatur des alten Schlüssels, mit dem der Dieb beliebig zurückdatierte fälschen kann. Ein Client, der sie mit dem neuen Schlüssel neu verpackte, bezeugte die Fälschungen |
| Generator | Passwörter aus Klein- und Großbuchstaben, nach Wahl Ziffern und Sonderzeichen, je mindestens eines; Passphrasen aus der englischen EFF-Wortliste (7776 Wörter, 12,9 Bit je Wort); Stärke in Bit: unter 60 schwach, unter 80 gut, ab 80 stark | Eine gute deutsche Wortliste mit klarer Lizenz fehlt; die EFF-Liste ist geprüft, frei (CC BY 3.0 US) und meidet verwechselbare Wörter. Die Bits zählen, was ein Angreifer schafft, der die Einstellungen kennt; die Grenzen folgen dem, was Offline-Raten gegen einen Server mit Secret Key heute nicht erreicht |
| Favoriten | Der Favorit ist ein Feld des Eintrags (`favorite` im Geheimtext, P-09) und gilt für alle im Tresor; markieren darf, wer bearbeiten oder verwalten darf, Leser sehen den Stern ausgegraut | Das Format hat den Favoriten schon im Eintrag; ein eigener je Person gehörte in den verschlüsselten Kontostand (`AccountState`), braucht dort ein neues Feld und einen eigenen Abgleich und kann später dazukommen. Für ein kleines Team sind gemeinsame Favoriten („die Zugänge, die alle oft brauchen“) ein brauchbarer Anfang |
| Frühere Passwörter | Ändert der Dialog ein geheimes Feld, kommt der alte Wert mit der Zeit in `history`; je Feld bleiben die zehn neuesten, gekürzt beim Speichern auf dem Gerät, der Abgleich (P-21) kürzt nie | Ohne Grenze wüchse ein Eintrag mit monatlich geändertem Passwort ohne Ende; zehn reichen, um einen missglückten Wechsel zurückzunehmen. Was der Abgleich rettet, zählt mit, geht aber erst bei einer späteren Änderung verloren, nie beim Zusammenführen selbst |
| Zum Ändern | Auf dem Gerät aus den entschlüsselten Einträgen berechnet: schwach (in den 1000 häufigsten Passwörtern aus SecLists, MIT, auch mit Ziffern oder Zeichen drumherum, oder unter 60 Bit nach Länge und Zeichenarten) oder doppelt (derselbe Wert in mehr als einem sichtbaren Eintrag); geprüft werden nur die Passwörter der Arten und die Passphrase von SSH-Schlüsseln | Eine Bibliothek wie zxcvbn brächte bessere Schätzungen, aber eine große Abhängigkeit mit Wörterbüchern in den Client; die einfache Regel ist ehrlich dokumentiert und nutzt die Grenze des Generators. Nichts davon geht an den Server: auch Prüfsummen von Passwörtern wären dort ein Angriffsziel |
| Suche | Titel, Art, Tags und die Werte aller nicht geheimen Felder, ohne Groß- und Kleinschreibung und Akzente; geheime Felder, frühere Passwörter und TOTP-Schlüssel nie | Wer Zugriff auf ein entsperrtes Gerät hat, soll nicht durch Eintippen herausfinden, in welchem Eintrag ein bekanntes Passwort steht |
| QR-Scan für Einmalcodes | `jsqr` in der Web-App, erst beim Scannen geladen; Kamera über `getUserMedia`, sonst ein Bild oder Screenshot | `BarcodeDetector` fehlt am Desktop unter Linux und Windows; jsQR ist reines JavaScript ohne Abhängigkeiten, und das Bild verlässt das Gerät nicht |
| Service Worker der PWA | `sw.js` mit festem Namen, von Bun außerhalb von Vite gebaut, der öffentliche Release-Schlüssel eingebaut; jede neue Version der App kommt über das signierte Release-Manifest, nicht über einen neuen Service Worker | Ein Service Worker kann seinen eigenen Austausch nicht verhindern; bleibt er Byte für Byte gleich, tauscht der Browser ihn nie, und jedes Update läuft durch die Prüfung von Signatur und Hashes |
| Reihenfolge der Releases | Das Release-Manifest trägt eine Folgenummer (`SOURCE_DATE_EPOCH`, sonst die Commit-Zeit, aber mindestens eins mehr als beim Commit davor, außerhalb eines Checkouts die Bauzeit); der Service Worker merkt sich die höchste je geprüfte und nimmt nur eine höhere, auch nicht bei der Installation eines neuen `sw.js` eine ältere | Sonst könnte der Server ein altes, korrekt signiertes Release mit einer bekannten Lücke zurückspielen |
| Reproduzierbarer Build | `bun run reproducible` baut denselben Commit zweimal, das zweite Mal in anderer Zeitzone und Locale, und vergleicht jede Ausgabe von `bun run build` per SHA-256: Web-App samt `release.json` und `release.sig`, die Extension je Browser, den kompilierten Server; `--release` vergleicht die Web-App mit einem veröffentlichten `release.json`. CI hängt im `unit`-Job nach `bun run build` einen zweiten Build an (`--reuse`, etwa 8 s), statt eines eigenen Jobs. Die Folgenummer kommt aus der Zeit des Commits, Ed25519 signiert ohne Zufall | Nur wenn derselbe Commit dieselben Bytes ergibt, kann jemand ohne Vertrauen in den Server oder in uns prüfen, dass ein signiertes Release aus dem öffentlichen Quelltext stammt; ein eigener Job würde auf einen freien Runner warten (Fünf-Minuten-Regel), der zweite Build kostet im `unit`-Job nur Sekunden. Gleich muss auch die Bun-Version sein (`packageManager`), sonst unterscheidet sich der kompilierte Server |
| Update der PWA | Eine geprüfte neue Version wartet auf das nächste Neuladen; die Seite zeigt „Neue Version bereit“ mit „Neu laden“ | Unter einer laufenden Seite die Dateien zu tauschen, mischte alte und neue Teile; die Version davor bleibt für offene Tabs |
| Was der Service Worker nicht hat | Solange eine Version gilt, bekommt eine Datei, die kein geprüfter Cache hat, einen Fehler statt der Antwort des Netzes; eine Navigation unter `/api` oder `/auth` bekommt Weiterleitungen, sonst nur Text in einer Sandbox | Sonst holte ein alter Tab seinen nachgeladenen Code ungeprüft vom Server, und eine Seite des Servers unter `/api` liefe mit dem Speicher der App; Anmeldeabläufe leiten weiter und bleiben so möglich (Review von K-308a) |
| Offline lesbar | Die Web-App hält in IndexedDB nur Geheimtexte und was der Server ohnehin hat (verpackter AK, Schlüsselblock, Kontozustand, die Antworten zu Tresoren, Logs, Tresor-Schlüsseln, Firma, Mitgliedern ohne Namen und Freigaben, die geprüften Datensätze der Einträge) und prüft sie offline wie die Antworten des Servers; ohne Server entsperrt sie mit Passphrase und Secret Key, liest nur und zeigt „Offline – nur lesen“ mit dem letzten Abgleich; Änderungen gibt es offline nicht, auch keine Warteschlange | wie bei 1Password und Bitwarden: Die Kopie ist ohne Passphrase und Secret Key nutzlos; die Kopie als weiterer, nicht vertrauter Server hält jede Prüfung an einer Stelle. Eine Warteschlange mit Konflikten über Tage brauchte eigene Oberfläche und kommt, wenn jemand sie braucht |
| Zurückspielen nach der Offline-Kopie | Der Kontozustand, den das Gerät zuletzt kannte, liegt unter AK versiegelt in der Kopie und geht in jeden Kontozustand des Servers ein (der höhere Stand gewinnt, bei Widerspruch der eigene); ein neu geöffneter Tresor zieht zuerst die gespeicherten, geprüften Datensätze und dann den Server | So kann ein Server mit einem älteren Kontozustand, einem kürzeren Log oder einer älteren Version eines Eintrags das Gerät nicht zurückwerfen (E-07, E-13, E-15), auch nicht über ein Neuladen hinweg |
| Sperren und Abmelden mit Offline-Kopie | Sperren lässt die Kopie liegen, „Dieses Gerät abmelden“ und ein anderes Konto auf dem Gerät löschen sie; nach dem Entsperren ohne Server bleibt der Anmelde-Schlüssel (nie die Passphrase) im Speicher, bis der Server wieder antwortet | Entsperren ohne Server braucht die Kopie nach dem Sperren; wer abmeldet, will das Konto vom Gerät haben. Mit dem Anmelde-Schlüssel meldet sich die App von selbst wieder an, ohne die Passphrase zu behalten |
| App-Icon | Das Schloss der Rail (lucide `Lock` auf `--primary`), als SVG und daraus gerenderte PNGs | Ein Zeichen für die App überall; ein Schlüssel steht in der App schon für die Einträge |
| Extension für Firefox | Ein Manifest aus `apps/extension/src/manifest.ts` für beide Builds; `vite build --mode firefox` setzt `background.scripts` statt `service_worker`, eine feste ID in `browser_specific_settings.gecko` und Firefox 140 als Mindestversion | Firefox kennt für Extensions keinen Service Worker und braucht eine feste ID, damit Speicher und Berechtigungen eine Neuinstallation überstehen; ab 140 (ESR) liest Firefox die Angaben zur Datenerhebung, die addons.mozilla.org verlangt. Alles andere bleibt gleich, darum keine zweite Konfiguration |
| Firefox für Android und Safari | Derselbe Firefox-Build für Android (`gecko_android`, ab 142); `vite build --mode safari` baut nach `dist/safari` den Ordner für `xcrun safari-web-extension-converter`, mit Service Worker, Safari 18 als Mindestversion und ohne `use_dynamic_url`; jeder Build prüft sein fertiges Manifest (`build/manifest-rules.ts`), den Firefox-Build zusätzlich `addons-linter`. Getestet wird je Engine mit Playwrights Firefox und WebKit (`e2e/engines`): das gebaute Popup als Seite und der Code von Content Script und Service Worker beim Ausfüllen in einem Harness. Ohne IntersectionObserver v2 füllen, speichern und signieren Menü und Leiste dort nicht | crxjs kennt nur Chrome und Firefox, Safari liest das Manifest wie Chrome; Playwright lädt Extensions nur in Chromium, `web-ext run` braucht ein echtes Firefox, Safari einen Mac. So prüft die Schleife unter Linux alles, was eine Engine entscheidet (Popup, Host, Frame, Sichtbarkeit von Menü und Feldern), und lässt Xcode, Signatur, Stores und echte Geräte einer Person. Ohne v2 bliebe gegen Clickjacking nur die Prüfung des Content Scripts, die Abdeckungen in fremden Shadow Roots übersieht; lieber kein Ausfüllen als ein unsicheres. `web-ext` selbst bricht mit der festen `minimatch`-Version des Projekts, darum direkt sein Prüfer `addons-linter` |
| Speicher der Extension | Die Extension benutzt nur `chrome.storage.session`, nur über `session-keys.ts` und mit Zugriff nur für die Extension selbst (`TRUSTED_CONTEXTS`); `chrome.storage.local`, `sync`, `localStorage` und IndexedDB nie, auch nicht für Einstellungen; die Texte kommen über eine eigene Paraglide-Laufzeit ohne `localStorage`-Strategie – ein Test prüft die Quellen, jeder Build prüft das fertige Bundle samt eingebundener Pakete | Gibt es einen Speicher auf der Festplatte, landet früher oder später ein Schlüssel darin; Sprache und Hell/Dunkel folgen darum Browser und System. Die Paraglide-Laufzeit der Web-App liest und schreibt `localStorage` und käme über `packages/ui` sonst mit ins Bundle. Firefox kennt `setAccessLevel` nicht, hält den Bereich aber ohnehin von Content Scripts fern |
| Konto in der Extension | Das Popup fragt beim ersten Öffnen nach Server, Konto-ID, Secret Key und Passphrase; Server, Konto-ID, Secret Key und eine Geräte-ID liegen in `chrome.storage.session` (`kennwort-device`) bis zum Schließen des Browsers, AK und Sitzungs-Token daneben (`kennwort-keys`) bis zum Sperren. Ein neues Popup öffnet mit AK Schlüsselblock und Kontozustand neu aus den Geheimtexten des Servers | Die Extension hat keinen Speicher auf der Festplatte (Speicher der Extension); der Secret Key bleibt so ein zweiter Faktor auch gegen jemanden, der den Browser-Speicher liest. Preis: Nach einem Neustart des Browsers tippt man Konto-ID und Secret Key neu ein, und jede Browser-Sitzung erscheint als eigenes Gerät in der Geräteliste. Koppeln per QR-Code (P-04) kann das später ersetzen |
| Entsperren in der Extension | Derselbe Ablauf wie in der Web-App (`signInAndUnlock`), dazu der Code für Tresore, Einträge, Richtlinie und Suche, nach `packages/client` verschoben statt kopiert; der Generator nach `packages/ui`. Kein Knopf „Mit Passkey entsperren“, solange kein Client mit Passkey entsperrt | Was beide Clients prüfen, soll es nur einmal geben; ein Knopf, der nichts tut, wäre schlechter als keiner |
| Sperren in der Extension | Die Sperrzeit der Firmen-Richtlinie (sonst zehn Minuten) ohne Klick oder Taste im Popup; ein Alarm des Browsers (`chrome.alarms`), bei dem der Service Worker die Schlüssel löscht. Schlüssel ohne laufenden Alarm nimmt kein Popup an, und gespeichert wird erst, wenn der Alarm steht | Das Popup ist meist geschlossen, ein Timer darin liefe nicht; der Service Worker selbst wird nach kurzer Zeit beendet, ein Alarm weckt ihn |
| Treffer im Popup | Exakter Host aus den URL-Feldern des Eintrags, gelesen mit `tldts` gegen die Public Suffix List: keine Eltern- oder Subdomain, kein öffentliches Suffix wie `co.uk` oder `github.io` als eine Website; Schema, Port, Pfad und Groß- und Kleinschreibung zählen nicht. Popup, Inline-Menü und Service Worker nutzen dieselbe Funktion (`apps/extension/src/page/matches.ts`). Die Adresse des Tabs nur über `activeTab`; das Popup kopiert, ausgefüllt wird im Inline-Menü | Eine Regel für Anzeige und Ausfüllen statt zweier, die auseinanderlaufen können. `tldts` ist reiner Code ohne Ein- und Ausgabe, sein einziges Paket `tldts-core` stammt aus demselben Projekt und hat keins; beide exakt gepinnt (7.4.19). Die Liste macht Popup, Menü und Service Worker um rund 130 kB größer, das Content Script nicht. `activeTab` statt `tabs`: Die Extension sieht nur den Tab, über dem man sie öffnet |
| Inline-Menü | Ein Content Script in jedem http(s)-Frame legt unter ein Login-Feld ein eigenes Element mit geschlossenem Shadow Root im Top Layer (manuelles Popover); darin ein iFrame der Menü-Seite der Extension, die als einzige Seite für Websites ladbar ist, in Chrome unter einer Adresse, die jede Browser-Sitzung wechselt (`use_dynamic_url`). Das Menü öffnet das Konto, das das Popup entsperrt hat, und lädt die Einträge selbst; es verschiebt die Sperrzeit nie. Gesperrt bietet es „Zum Entsperren öffnen“ an (öffnet das Popup) | Die Seite kann weder in das Menü sehen noch seine Adresse lesen; das Content Script hält keine Geheimnisse und keine Einträge. Ein Menü, das die Sperrzeit verschöbe, hielte die Extension offen, solange eine Seite immer wieder ein Feld fokussiert. Preis: Jedes Öffnen lädt und prüft die Einträge neu, wie ein neues Popup |
| Ausfüllen nur nach Klick | Ausgefüllt wird nur nach einem Klick oder Enter auf einen Eintrag im Menü, den der Browser zustellt (`isTrusted`). Das Menü muss dabei seit 500 ms ohne Unterbrechung sichtbar sein, gemessen mit IntersectionObserver v2 (`trackVisibility`), und 300 ms nach dem Klick noch immer. Vor dem Schreiben prüft das Content Script von der Seite aus noch einmal: Popover offen, ganz im Bild, weder das Element noch ein Vorfahre durchsichtig, gefiltert, beschnitten oder maskiert, nichts nach dem Menü in den Top Layer gekommen, und der Hit-Test der Seite trifft das Element in der Mitte und an allen Ecken. Firefox kennt v2 nicht: Dort füllt das Menü nicht aus und sagt das | Abwehr des DOM-basierten Clickjackings auf Extension-Menüs (Marek Tóth, DEF CON 33, 2025): Die Seite deckt das Menü ab oder macht es durchsichtig und lässt den Klick hindurch. v2 sieht in Chromium Abdeckungen, auch solche mit `pointer-events: none`, aber keine Deckkraft, die die Seite setzt (E2E-Test); die Prüfung des Content Scripts sieht Deckkraft und Abdeckungen im Dokument, aber keine in fremden geschlossenen Shadow Roots mit `pointer-events: none`. Erst beide zusammen decken beides ab. Restrisiko: eine Abdeckung, die kürzer als etwa 100 ms um den Klick herum liegt |
| Ausfüllen nur im geprüften Frame | Der Service Worker fragt bei jeder Anfrage des Menüs den Frame-Baum des Tabs ab (`webNavigation`), lässt sich vom Content Script des einen Frames bestätigen, dass es das Menü mit dieser Nonce geöffnet hat, und füllt nur, wenn dieser Frame der oberste ist oder dieselbe Herkunft hat wie jeder Frame über ihm, wenn seine Adresse jetzt genau zum Host einer gespeicherten Adresse passt und kein für https gespeichertes Passwort in eine http-Seite ginge. Das Passwort geht nur an dieses Dokument (`frameId` und `documentId`), das Content Script prüft Nonce, Host und Sichtbarkeit noch einmal | Der Frame-Baum des Browsers listet die Frames der Extension nicht, also kann der Service Worker nicht vom Menü auf seinen Frame schließen; die Nonce kennen nur das Content Script und sein eigener Menü-Frame. Kein Zustand im Service Worker, der beim Beenden verloren ginge. `webNavigation` warnt beim Installieren mit dem Verlauf, den der Zugriff auf alle Websites ohnehin nennt |
| Speichern und Aktualisieren | Nach einer Anmeldung bietet die Extension an, ein neues Login zu speichern oder ein geändertes Passwort zu aktualisieren (das alte kommt in die Historie). Erfasst wird nur ein Absenden, das der Browser zustellt, höchstens eine Sekunde nach einem echten Klick oder Tastendruck, nur aus sichtbaren Feldern, nur im obersten oder einem gleich-herkünftigen Frame; dazu ein Klick auf den Knopf eines Login-Formulars und Enter ohne Formular für Anmeldungen per Skript. Das Content Script gibt das Login sofort an den Service Worker; der hält es nur im Arbeitsspeicher, je Tab eines, bietet es einmal dem obersten Frame an und gibt es einmal an die Leiste, nach spätestens einer Minute ist es weg. Die Leiste ist eine Seite der Extension wie das Inline-Menü (geschlossenes Shadow DOM, Nonce, `use_dynamic_url`, dieselbe Abwehr gegen Clickjacking); sie öffnet sich unsichtbar, vergleicht selbst mit den Einträgen des exakten Hosts und speichert über den Eintrags-Speicher von `packages/client` | Der Vergleich braucht die entschlüsselten Einträge; die gibt es nur in Seiten der Extension (Popup, Menü, Leiste), nicht im Service Worker, der so ohne Schlüssel und ohne Kopie der Einträge bleibt und jederzeit beendet werden darf. Darum vergleicht die Leiste und nicht der Service Worker, und darum öffnet sie sich erst unsichtbar: Ein bekanntes Login soll nichts zeigen. Ein Passwort in `chrome.storage.session` überlebte zwar einen beendeten Service Worker, läge aber länger und an einem Ort, den jede Seite der Extension liest; im Arbeitsspeicher geht es im seltenen Fall verloren, dann fragt die Extension eben nicht. Ob eine Anmeldung geklappt hat, sieht die Extension nicht; ohne Neuladen gilt ein verschwundenes oder ausgeblendetes Passwortfeld als Erfolg, ein stehengebliebenes, auch ein geleertes, als Fehlschlag |
| Nie für diese Seite | Die Hosts, für die die Extension nie das Speichern anbietet, stehen im Kontozustand (`neverSave`, verschlüsselt unter AK), zusammengeführt als Vereinigung; ein neues Feld mit Standardwert wie zuvor `policy`, ohne neue Formatversion von F-01. Herausnehmen kommt später mit einer Einstellungsseite (dann mit Grabstein, damit die Vereinigung es nicht zurückholt) | Die Extension hat keinen Speicher auf der Festplatte (Speicher der Extension), und die Liste soll auf allen Geräten des Kontos gelten. Preis: Gesperrt kennt die Extension die Liste nicht; die Leiste bietet dann „Entsperren und speichern“ an und schließt sich nach dem Entsperren. Ein älterer Client, der das Feld nicht kennt, ließe es beim Zurückschreiben fallen; alle Clients kommen aus demselben Release |
| Phishing-Warnung | Nach Googles Password Alert: Seiten der Extension, die die Einträge entschlüsselt haben (Popup, Inline-Menü, Leiste), legen eine Alarmliste in `chrome.storage.session` an, nur solange entsperrt: je Passwort mit Website ein F-10-Tag (Argon2id, 1 MiB, t = 2, vier Byte) und gesalzene Hashes der exakten Hosts, mit neuem Salt je Entsperren. Das Content Script schickt nur den Tag dessen, was der Nutzer selbst getippt hat (`isTrusted`), wenn er das Feld verlässt, Enter drückt oder absendet; der Service Worker vergleicht und warnt, wenn kein Eintrag mit diesem Passwort für den exakten Host gespeichert ist. Die Warnung erscheint in der Leiste von K-404 (keine weitere Seite für Websites), hält sich oben und lässt sich nur mit den Prüfungen gegen Clickjacking wegklicken; einmal je Tab, Host und Passwort | Kein Passwort im Klartext zwischen Seite und Extension, kein Tastendruck an den Service Worker (anders als Password Alert). Vier Byte statt eines ganzen Hashes: genug gegen Fehlalarme bei einigen Hundert Passwörtern, aber ein Tag allein bestätigt kein geratenes Passwort; Argon2id verteuert jeden Versuch zusätzlich. Nur selbst Getipptes zählt, damit eine Seite keine Passwörter durchprobieren kann. Die Liste entsteht in Seiten der Extension, weil nur dort entschlüsselte Einträge leben (P-17); das Content Script lädt dafür nur F-10 aus `packages/crypto` (Unterpfad `password-alert`), nicht den Code der Einträge |
| Passkey-Anbieter | Die Extension ist ein WebAuthn-Authenticator für Websites: Ein Skript im Hauptkontext der Seite (`world: "MAIN"`, vor allen Skripten der Seite) tritt vor `navigator.credentials.create` und `get` und gibt `publicKey`-Zeremonien über das Content Script seines Frames an den Service Worker; der prüft Frame, Herkunft und rpId am Frame-Baum, hält die Zeremonie im Arbeitsspeicher und lässt den obersten Frame die Leiste von K-404 öffnen. Die Leiste lädt die Einträge, legt nach einem Klick, der zählt, einen Passkey an oder signiert mit einem, und erst dann bekommt die Seite eine Antwort. Wie bei Bitwarden: Eine Seite, die Kennwort nicht bedient, bekommt das WebAuthn des Browsers | Nur so erreichen Passkeys aus dem Tresor jede Website, ohne dass der Browser einen Anbieter-Mechanismus für Extensions hat. Das Skript in der Seite kann die Seite selbst ausführen; es entscheidet darum nichts und kennt nichts, was die Seite nicht ohnehin über `navigator.credentials` bekäme. Signiert wird in der Leiste, weil nur Seiten der Extension entschlüsselte Einträge halten (P-17); der Service Worker bleibt ohne Schlüssel |
| Passkey als Eintrag | Eine eigene Art „Passkey“ mit festen Feldern (rpId, Benutzername, Anzeigename, Benutzer-ID, Credential-ID, privater Schlüssel als geheimes Feld, Zähler), ohne Adressfeld; der Schlüssel im Format F-12 (ES256 auf P-256 aus `@noble/curves`, RFC 6979, DER). Neu anlegen lässt sich die Art nur von einer Website aus | Wie jedes andere Feld liegt der Schlüssel im einen Geheimtext des Eintrags (P-09) und reist mit Sync, Freigaben und Schlüsselwechsel, ohne dass ein Protokoll etwas Neues lernt. ES256 nimmt jede Relying Party an. Ohne Adressfeld bietet weder Popup noch Inline-Menü einen Passkey zum Ausfüllen eines Passworts an; gefunden wird er über seine rpId |
| Zähler und Flags der Passkeys | Der Zähler bleibt 0, die Flags sagen „User Present“, „User Verified“, „Backup Eligible“ und „Backed Up“; Attestation „none“ mit einer AAGUID aus Nullen | Synchronisierte Passkeys können keinen gemeinsamen Zähler führen; 0 heißt nach WebAuthn §6.1.1 „kein Zähler“, wie bei Apple, Google und Bitwarden, und ein Anmelden muss so den Eintrag nicht schreiben (auch Leser eines Tresors melden sich an). Benutzer verifiziert heißt: Kennwort ist entsperrt und der Nutzer hat in die sichtbare Leiste geklickt. Eine AAGUID aus Nullen verrät der Relying Party nicht, welcher Manager den Passkey hält |
| Wann der Browser übernimmt | Gesperrt, ohne geladene Einträge, auf „Anderes Gerät verwenden“ (auch wenn kein Passkey zu einer Anmeldung passt: die Leiste sagt das, statt unsichtbar abzugeben, damit die Seite nicht an ihr abliest, welche Passkeys es gibt), in einem Frame anderer Herkunft, auf einer Seite ohne sicheren Kontext, bei bedingter Vermittlung (`mediation: "conditional"`) und ohne ES256 in `pubKeyCredParams` ruft die Extension die Funktion des Browsers mit den Optionen der Seite auf. Eine rpId, die nicht der Host der Seite oder ein registrierbares Suffix davon ist, endet in `SecurityError` | Der Browser prüft die Permissions Policy (`publickey-credentials-get`/`-create`) für fremde Frames selbst; Kennwort bedient nur Frames, in die es auch ausfüllen dürfte. Gesperrt öffnet die Extension nichts von sich aus, sondern lässt den Browser fragen; wer Kennwort will, entsperrt im Popup. Ausschließen (`excludeCredentials`) zeigt einen Hinweis statt `InvalidStateError`, damit die Seite nicht ohne Klick erfährt, welche Passkeys es gibt |
| CORS für die Extension | Der Server antwortet der Herkunft einer Extension (`chrome-extension://<id>`, `moz-extension://<uuid>`) mit CORS-Kopfzeilen, nur unter `/api` und `/auth/login-key`, ohne `Allow-Credentials`; Webseiten bekommen keine | Die Extension spricht den Server der Firma unter fremder Herkunft an. Seit K-403 läuft zwar ein Content-Skript auf allen Seiten, es stellt aber keine Anfragen an den Server; Popup, Menü und Service Worker tun das ohne Host-Berechtigung für den Server, die bei jeder Firma eine andere Adresse bräuchte. Jede Anfrage trägt ein Bearer-Token, also gibt CORS keiner Extension etwas, das sie nicht schon hat |
| Extension in den E2E-Tests | Ein eigener Build (`vite build --mode e2e`, `dist/e2e`) mit Host-Berechtigung nur für `https://*.test/*`; das Popup öffnet der Service Worker in einem eigenen Fenster und liest den aktiven Tab des zuletzt fokussierten normalen Fensters | Playwright kann das Symbol der Extension nicht anklicken, also gibt `activeTab` nie eine Adresse frei; alles andere ist derselbe Code wie im Release, und das Release trägt die Berechtigung nie (Test) |
| Import-Parser | Je Format eine reine Funktion in `packages/core/src/import/` (`(Datei) => Result<ImportedEntry[], ImportError>`), Datei als Text oder Bytes; ein Eintrag kommt im eigenen Format (P-09) mit den Ordnern oder Sammlungen des anderen Managers als Hinweis für die Tresore. Felder der Art bekommen deren feste IDs, alles andere wird ein eigenes Feld, Notizen ein Notizfeld am Ende; die Namen gespeicherter Felder sind englisch, angezeigt wird ohnehin die Beschriftung der Art | Der Import-Ablauf (K-501) braucht nur eine Liste von Einträgen und Ordnern; ohne Oberfläche und ohne Nebenwirkungen lässt sich jeder Parser mit Fixtures, Fuzzing und Mutation-Tests prüfen |
| CSV, XML und JSON ohne Bibliothek | Ein eigener CSV-Leser (RFC 4180, nachsichtig wie Excel), ein kleiner XML-Leser nur für KeePass (ohne Dokumenttyp, also ohne Entitäten) und Zod für die JSON-Exporte; kein Papa Parse, kein DOMParser | Jedes Paket liefe dort, wo Klartext liegt (K-102); `DOMParser` fehlt in Bun und im Service Worker. Beide Leser arbeiten in einem Durchgang ohne Rekursion, das Fuzzing fand so einen quadratischen Pfad bei tief verschachtelten KeePass-Gruppen, der jetzt linear ist |
| Import in Teilen | K-502 Teil 1 liest alle Textformate (CSV, JSON, KeePass-XML), Teil 2 die ZIP-Container (1PUX, Dashlane-, Proton-ZIP), Teil 3 KDBX 4; verschlüsselte Fremdexporte folgen als eigener Teil, Team Password Manager und CXF danach | ZIP und KDBX brauchen Entpacken (`DecompressionStream`, asynchron) und KDBX Argon2, AES und ChaCha20 aus `@noble` mit eigener Rahmung und Testvektoren; das ist je ein eigener Prüfumfang. Das CSV von Team Password Manager ließ sich ohne Zugang zu dessen Doku nicht an echter Struktur festmachen, CXF ist noch ein Entwurf |
| ZIP-Container beim Import | Ein eigener kleiner ZIP-Leser in `packages/core/src/import/zip.ts` nach APPNOTE.TXT: zentrales Verzeichnis, „gespeichert“ und „Deflate“, entpackt mit `DecompressionStream("deflate-raw")`; nur die Dateien, die der Parser verlangt. ZIP64, mehrere Datenträger und Verschlüsselung sind Fehler; Grenzen 10 000 Dateien, 64 MiB entpackt, 1 : 200; Länge und CRC-32 werden geprüft, Namen sind nur Schlüssel. Die Parser der Container sind asynchron, der Import-Ablauf wartet auf jeden Parser | `fflate` wäre eine weitere Abhängigkeit im Client für drei Exporte; die Plattform entpackt Deflate selbst, das Verzeichnis zu lesen sind wenige Dutzend Zeilen, die sich vollständig mit Mutation-Tests prüfen lassen. Ein Export braucht keine ZIP64- oder verschlüsselten Archive, jede gelesene Form mehr wäre Angriffsfläche |
| Mutation-Tests der Parser | Die Property-Tests der Parser laufen in `bun run test`, nicht im Mutation-Lauf; die 100 % dort erreichen die Fixture- und Einzeltests allein. In CI laufen die Parser als eigener Teil (`core-import`) nur gegen ihre eigenen Tests | Das Fuzzing berührt jede Zeile, Stryker liefe seine sekundenlangen Eingaben sonst gegen jede Mutante. Viele Mutanten der Parser sind statisch (Spaltentabellen, Schemas) und liefen sonst gegen alle Tests von `packages/core`, obwohl nur die Parser-Tests sie benutzen |
| Import-Ablauf | Seite „Importieren“ in den Einstellungen; ein Ziel-Tresor je Import, die Ordner des anderen Managers auf Wunsch als Tags; doppelt heißt gleicher Titel, Benutzername und Adresse (ohne Groß- und Kleinschreibung, ohne `/` am Ende) wie ein Eintrag im Ziel-Tresor oder weiter oben in der Datei, übersprungen bis „Trotzdem importieren“; schwach nach der Regel von „Zum Ändern“ | Tresore aus Ordnern bräuchten je ein signiertes Log, Mitglieder und für geteilte Ordner Gruppen – ein eigener Schritt, und ein Tresor je Ordner wäre für ein kleines Team meist zu viel; Tags lassen sich danach suchen. Zusammenführen hieße, zwei Werte eines Geheimnisses gegeneinander abzuwägen; Überspringen mit „Trotzdem“ verliert nichts und bleibt durchschaubar |
| Schreiben beim Import | Über den normalen Schreibweg der Einträge (`saveNew` in `packages/client`): verschlüsselt, signiert, an Eintrag, Tresor und Version gebunden; 25 Einträge je Abgleich; offline und bei ausstehendem Schlüsselwechsel nichts; was der Server nicht nahm, verlässt die Warteschlange sofort, und der Import hört beim ersten abgelehnten Stapel auf | Ein eigener Weg wäre eine zweite Stelle, an der Format und Prüfung stimmen müssen. Ein Abgleich je Eintrag zöge bei 500 Einträgen 500-mal alle Datensätze des Tresors. Ein abgebrochener Import, der beim nächsten Speichern still weiterliefe, widerspräche dem, was die Seite gesagt hat |
| Klartext beim Import | Die Datei liest der Browser auf dem Gerät (`File.arrayBuffer`), die Bytes werden nach dem Lesen mit Nullen überschrieben; die gelesenen Einträge liegen nur im Zustand der Seite, solange Zuordnung und Vorschau sie brauchen, der Abschluss behält nur Zahlen; die Vorschau zeigt nie ein geheimes Feld | Strings kann JavaScript nicht überschreiben; sie warten wie jeder entschlüsselte Eintrag auf die Speicherbereinigung. Wenigstens hält nichts sie länger fest als nötig |
| Tabellen beim Import | „Andere Tabelle“ liest die Spalten mit `csvColumns` und schlägt eine Zuordnung nach den Spaltennamen (deutsch und englisch) vor; nur Kommas als Trenner, wie der CSV-Leser aus K-502, und die Anleitung sagt es | Den Trenner zu erkennen (deutsches Excel schreibt Semikolons) gehört in den Leser in `packages/core` mit eigenen Fixtures und Mutation-Tests, nicht in den Ablauf |
| Wer exportiert | Inhaber und Admins der Firma (nach ihrem Zertifikat), je Tresor oder alles, was ihr Gerät öffnet; Mitglieder sehen keinen Export, der Server nimmt das Audit-Ereignis `export` nur von Inhabern und Admins | „Verwalter eines Tresors“ wäre jeder: Jedes Konto verwaltet seinen persönlichen Tresor. Ein Export nimmt jedes Geheimnis auf einmal aus dem Schutz der Ende-zu-Ende-Verschlüsselung; das entscheidet die Firma, nicht wer gerade einen Tresor verwaltet |
| Audit-Log vor dem Export | Der Client signiert `export` mit dem Gegenstand `format/umfang/export-ID` und schreibt die Datei erst, wenn der Server das Ereignis angenommen hat; offline gibt es keinen Export | So steht wer, was und wann unter der Signatur, ohne neues Feld in der Kette (`audit/chain.ts` bleibt, wie er ist); ein ehrlicher Client kann keinen Export am Log vorbei machen |
| Eigenes Export-Format | F-13: JSON um einen F-01-Geheimtext unter Argon2id (64 MiB, t = 3, p = 1, fest in v1) und HKDF; innen der Inhalt jedes Eintrags nach P-09 ohne Markierungen „Zum Ändern“, je Tresor sein Name; als `kennwort-json` wieder zu importieren | Vorbild ist Bitwardens passwortgeschützter Export, gebaut aus den eigenen Bausteinen statt PBKDF2 und AES-CBC. Parameter in der Datei könnte eine böswillige Datei hochsetzen; der Inhalt nach P-09 trägt alles, auch Arten und Passkeys, die später dazukommen |
| CSV beim Export | Bitwardens Spalten, jeder Wert, wie er ist (kein `'` vor `=`), CRLF; andere Arten als Login mit eigenen Feldern, mehrzeilige Felder und solche mit `: ` in den Notizen; deutliche Warnung und Bestätigung | Bitwardens CSV lesen die meisten Manager. Ein vorangestelltes `'` gegen Formeln änderte Passwörter beim Umzug; die Datei gehört in einen Passwortmanager, nicht in eine Tabellenkalkulation, und das sagt die Warnung |
| Bitwardens verschlüsselter Export | Passwortgeschütztes JSON wird gelesen (PBKDF2 oder Argon2id, HKDF, AES-256-CBC mit HMAC-SHA256 aus `@noble`, nach Bitwardens eigenem Code); der kontobeschränkte Export endet mit eigener Meldung; Grenzen der Schlüsselableitung sind die Bereiche, die Bitwarden selbst importiert (P-19). Bitwardens JSON erkennt die Verschlüsselung an der Datei und fragt erst dann nach dem Passwort | Wer umzieht, hat oft nur den verschlüsselten Export, und der passwortgeschützte ist der sicherere Weg aus Bitwarden. Den kontobeschränkten öffnet nur Bitwardens Konto selbst, mit Kennworts Mitteln also nie. Bitwardens eigene Bereiche nehmen jeden Export, den Bitwarden schreibt, und keinen, der das Gerät länger als etwa anderthalb Minuten rechnen lässt |
| KDBX beim Export | KDBX 4.0 mit Argon2id (64 MiB, drei Durchläufe), ChaCha20 für Inhalt und inneren Strom, ungepackt, eine Gruppe je Tresor; geschrieben mit denselben Bausteinen wie der Leser (`kdbxEncrypt` neu in `packages/crypto/src/kdbx.ts`), Rahmung nach KeePassXCs `Kdbx4Writer.cpp` | Argon2id und ChaCha20 sind die Bausteine, die Kennwort ohnehin nutzt; ungepackt spart einen asynchronen Schritt und Angriffsfläche, ein Export ist klein. Geprüft mit dem eigenen Leser, mit `keepassxc-cli` und pykeepass |
| Download des Exports | Blob, ein Link, ein Klick, die Adresse sofort widerrufen, die Bytes mit Nullen überschrieben; die Passphrase steht nur im Feld, bis das Formular abgeschickt ist | Keine Adresse auf den Klartext überdauert den Klick; Zeichenketten kann JavaScript nicht löschen, sie warten wie jeder entschlüsselte Eintrag auf den Garbage Collector |

## Stack

Der Stack folgt `tech-stack.md` aus firsttris/workflows; vier Abweichungen sind begründet und
stehen im CLAUDE.md.

| Teil | Wahl | Begründung |
| --- | --- | --- |
| Monorepo | Bun Workspaces, Biome, TypeScript strict, Vitest, Playwright | wie überall |
| Server | Bun + Hono + Drizzle + SQLite + Zod, `bun build --compile`, Docker-Image amd64/arm64 | eigene API für Extension, Web-App und CLI |
| Auth | Better Auth: Passkeys und ein allgemeiner OIDC-Client (in der Suite Kontext oder Stalwart) | nur Login und Sync, nie zum Entschlüsseln |
| Extension | Solid 2 + Vite + `@crxjs/vite-plugin`, Manifest V3, Chrome/Edge/Firefox (auch Android)/Safari | Stack-Vorgabe für Extensions |
| Texte | Paraglide JS (de/en) für alle Oberflächen, auch Extension und Mobile-App; `_locales` nur für Name, Beschreibung und Manifest der Extension | **Abweichung**: Web-App und Extension teilen `packages/ui`, also auch die Texte |
| Web-App | Solid 2, statische SPA/PWA | **Abweichung von React**: ein UI-Paket für Web-App und Extension, kleineres Bundle zum Auditieren |
| Kein TanStack Start / SSR | statischer Build mit Hashes im Dateinamen | **Abweichung**: nur ein statischer Build lässt sich signieren und im Service Worker prüfen |
| Routing, Server-Daten | `@tanstack/solid-router` 2.0.0-rc.11 und `@tanstack/solid-query` 6.0.0-rc.6, beide Release Candidates (siehe Entscheidungen) | lokaler entschlüsselter Zustand ist die Quelle, nicht der Server-Cache; Query lädt nur, was die Seiten vom Server zeigen |
| UI | shadcn-Stil **ohne Abhängigkeiten**: `<dialog>`, Popover-API, CSS Anchor Positioning, eigene `cn()` und `variants()`, Tailwind 4, lucide-Icons (`lucide` statt `lucide-solid`, siehe Entscheidungen), Geist, Zinc-Tokens (siehe DESIGN.md) | jedes Laufzeitpaket läuft dort, wo Klartext liegt |
| Krypto | `@noble/ciphers`, `@noble/curves`, `@noble/hashes`, `@noble/post-quantum` | auditiert, reines TS, ohne eigene Abhängigkeiten |
| Sonstiges | `tldts` (Public Suffix List), `zod` | |
| Mobile-App | Tauri 3 mit der Solid-UI aus `packages/ui`; native Autofill-Plugins: Android `AutofillService` (Kotlin), iOS AutoFill Credential Provider (Swift) | **Abweichung von Tauri 2**: Tauri 3 ist zur Zeit der Mobile-Phase voraussichtlich stabil; als letzte Phase gebaut, Rückfall auf 2.x |

Abhängigkeiten exakt gepinnt, Renovate mit Wartezeit, `bun install --frozen-lockfile`, keine
Install-Skripte außer `trustedDependencies`.

## Kryptografie

Bewährte, standardisierte Bausteine, modern zusammengesetzt; keine eigenen Algorithmen oder
Protokoll-Erfindungen.

| Zweck | Verfahren | Status |
| --- | --- | --- |
| Symmetrisch | XChaCha20-Poly1305 (AEAD), 256 Bit | bewährt (libsodium) |
| Schlüssel verpacken | X25519 + ML-KEM-768 hybrid | ML-KEM = NIST FIPS 203 (2024), in TLS, Signal, iMessage |
| Signaturen | Ed25519 (ML-DSA später nachrüstbar) | bewährt |
| Passphrase | Argon2id (RFC 9106) + 128-Bit-Secret-Key | bewährt |
| Entsperren | WebAuthn PRF (Passkey) | neu, Passphrase als Notweg |
| Ableitung | HKDF-SHA-512 | bewährt |

Schlüsselhierarchie:

```text
Passkey (PRF) ──────────┐
Passphrase + Secret Key ──┼─► Account Key (256 Bit, zufällig)
Recovery-Kit (Papier) ────┘          │
(Firmen-Recovery, Standard)        ├─► Benutzer-Schlüssel: Hybrid-KEM + Ed25519
                                   │
Tresor-Schlüssel ◄──────────────────┘  pro Mitglied verpackt
      │
Eintrags-Schlüssel ─► Eintrag (Titel, URL, Passwort, TOTP, Notizen – alles verschlüsselt)
```

Regeln:

- **AAD** bindet jeden Geheimtext an Eintrags-ID, Tresor-ID und Version: kein Vertauschen, keine
  alten Stände.
- **Signiertes Mitgliedschafts-Log** pro Tresor (Hash-Kette, Admin-signiert); Clients prüfen und
  merken sich den letzten Stand.
- **Firmen-Wurzelschlüssel**: Inhaber signieren die öffentlichen Schlüssel der Mitarbeiter;
  unerwartete Wechsel lösen eine Warnung aus.
- **Austritt**: neuer Tresor-Schlüssel, betroffene Passwörter werden zum Ändern markiert.
- **Neues Gerät**: Freigabe von einem angemeldeten Gerät per QR-Code und Vergleichscode.
- Login per Passkey/SSO, die Passphrase verlässt nie das Gerät; daher kein OPAQUE nötig.

## Bedrohungsmodell

Der Server gilt als nicht vertrauenswürdig; die größten Risiken liegen in Extension, ausgeliefertem
Code und Endgeräten, nicht in den Algorithmen.

| Angriff | Gegenmittel | Restrisiko |
| --- | --- | --- |
| Datenbank gestohlen | nur Geheimtexte; Secret Key verhindert Offline-Raten der Passphrase | keins bei korrekter Umsetzung |
| Später mit Quantenrechner entschlüsseln | Hybrid X25519 + ML-KEM-768 | gering |
| Server nimmt heimlich jemanden in einen Tresor auf | signiertes Mitgliedschafts-Log, Clients prüfen die Kette | keins |
| Server schiebt fremden öffentlichen Schlüssel unter | Firmen-Wurzelschlüssel signiert Mitarbeiterschlüssel, Warnung bei Wechsel | erster Kontakt (TOFU) |
| Server vertauscht Einträge oder spielt alte Stände ein | AAD mit ID und Version, Versionszähler im Client | keins |
| Server liefert manipulierte Web-App aus | Klartext-UI in der Extension; PWA mit signiertem Release-Manifest, Service Worker prüft Signatur und Hashes; Extension prüft Web-App | erste Installation, ein ausgetauschter Service Worker und die PWA am Handy, dokumentiert |
| Phishing-Seite will Autofill | exakter Host-Abgleich (PSL), nur nach Klick, nicht in fremden iFrames; Warnung, wenn jemand ein gespeichertes Passwort selbst auf einer fremden Domain eintippt | gering |
| Clickjacking auf das Autofill-Menü (DEF CON 2025) | Menü als Extension-iFrame im geschlossenen Shadow DOM im Top Layer; Klick zählt nur, wenn das Menü laut Browser sichtbar war (IntersectionObserver v2) und das Content Script es unverdeckt und undurchsichtig findet | gering |
| Supply-Chain im Client | etwa 6 Laufzeitpakete, gepinnt, keine Install-Skripte | gering |
| SSO-Konto übernommen | SSO entschlüsselt nichts, Passkey/Passphrase nötig | keins |
| Mitarbeiter verlässt Firma | neuer Tresor-Schlüssel, Passwörter zum Ändern markiert | kopierte Passwörter bis zur Änderung |
| Malware auf dem Gerät | automatisches Sperren, Schlüssel nur im Speicher | hoch, außerhalb des Modells |
| Passwort bleibt am Handy in der Zwischenablage | Kopieren nur auf Tipp; native App leert die Zwischenablage nach 30 s und markiert sie als sensibel | PWA kann nicht zuverlässig leeren |
| Anmeldung durchprobieren | Rate-Limits, Sperre nach Fehlversuchen; die Passphrase kommt nie zum Server | gering |

## Projektstruktur

Ein Monorepo mit Bun Workspaces; die Krypto- und Datenlogik ist reines TypeScript und wird von allen
Apps geteilt.

| Pfad | Inhalt | Laufzeit-Abhängigkeiten |
| --- | --- | --- |
| `packages/crypto` | Bausteine, Schlüsselhierarchie, Testvektoren, Property-Tests | `@noble/*` |
| `packages/core` | Zod-Schemas, Sync, Prüfung des Mitgliedschafts-Logs, Rechte, Import-Parser | `zod` |
| `packages/ui` | Solid-Komponenten im shadcn-Stil, native Elemente | `solid-js` |
| `apps/server` | Hono-API, Drizzle/SQLite, SSE für Live-Sync, Audit-Log als Hash-Kette | `hono`, `drizzle-orm`, `better-auth` |
| `apps/web` | Solid-SPA/PWA: Verwaltung und Tresor am Handy | `packages/*` |
| `apps/extension` | Solid, MV3, Popup, Inline-Menü, Autofill, Speichern | `packages/*`, `tldts` |
| `apps/mobile` | Tauri 3, Autofill-Plugins für Android und iOS | `packages/*` |
| `apps/cli` | `bun build --compile`, Secrets für Skripte und CI | `packages/*` |
| `e2e/` | Playwright, inklusive manipuliertem Testserver für die ETH-Angriffe | dev |

## Kopplung an andere Apps

Kennwort kennt weder Kontext noch Stalwart, nur Standards: eigenes Repo, eigener Container, und jede
Verbindung läuft über eine offene Schnittstelle, die auch andere Anbieter erfüllen. So macht es schon
Schreibzeug, das sich über einen allgemeinen OIDC-Client bei Kontext anmeldet.

| Was | Standard in Kennwort | In der Speicherstadt-Suite | Ohne Suite |
| --- | --- | --- | --- |
| Anmeldung | eigene Konten mit Passkey; wahlweise OpenID Connect (Client) | Kontext als OIDC-Provider, wie bei Schreibzeug, oder Stalwart direkt | Keycloak, Authentik, Entra ID, Google |
| Gruppen | eigene; wahlweise der groups-Claim aus dem ID-Token, Name des Claims einstellbar | info@, rechnung@ aus den Gruppenkonten in Stalwart | Gruppen des Anbieters |
| Benutzer anlegen und entfernen | Einladung oder Anmeldung legt an; optional SCIM-Endpunkt | Kontext könnte SCIM sprechen | jeder SCIM-Client |
| Verweise von außen | Deep Links, z. B. `/suche?q=Müller GmbH` | Kontext verlinkt vom Kunden auf seine Zugänge | jede App |

Ende-zu-Ende-Verschlüsselung setzt eine Grenze: Ein Gruppenwechsel beim Anbieter erzeugt nur eine
**Anfrage**. Zugriff gibt erst ein Verwalter frei, dessen Client den Tresor-Schlüssel für das neue
Mitglied verpackt und signiert; Entfernen wirkt sofort auf dem Server, den Schlüsselwechsel macht
der nächste Verwalter-Client. So kann weder der Anbieter noch der Server heimlich Zugriff
verschaffen.

## Bauplan im Agenten-Loop

Kennwort wird als fertiges Produkt gebaut, ohne MVP: Ein Agent arbeitet die
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md) Punkt für Punkt ab, bis
jedes Häkchen gesetzt und jede Prüfung grün ist. Er wartet nie auf einen Menschen; was nur Menschen
erledigen können, kommt nach dem Loop (unten).

Regeln für den Loop:

1. **Spezifikation zuerst**: `docs/sicherheitsdesign.md` und die Akzeptanzkriterien je Punkt der
   Bauliste. Ohne Kriterium kein Code.
2. **Ein Durchlauf, ein Punkt**: nächsten offenen Punkt nehmen, Tests zuerst (Vitest; Playwright
   desktop und `@phone`), umsetzen, Docs und Texte de/en nachziehen, `bun run check` grün, eigener
   Branch, Pull Request, bei sicherheitsrelevantem Code unabhängiges Review, CI grün, mergen, Punkt
   abhaken.
3. **Automatische Sicherheits-Gates in CI**: Testvektoren und Property-Tests für die Kryptografie,
   manipulierter Testserver mit den Angriffen der ETH-Studie, Liste erlaubter Laufzeit-Pakete,
   Bundle-Größe, CSP, Barrierefreiheit mit axe.
4. **Nicht hängen bleiben**: Änderungen an `packages/crypto` nur mit Testvektoren, Property- und
   Mutation-Tests; nie einen Test abschalten; ein Punkt, der dreimal scheitert, wird zurückgestellt
   und am Ende wieder aufgenommen. Signaturen baut der Loop mit Test-Schlüsseln.

Reihenfolge nach Abhängigkeiten:

1. **Fundament** – Repo-Gerüst, CI, Sicherheitsdesign, `packages/crypto`, `packages/core`.
2. **Server** – API, Sync mit SSE, Anmeldung, Mitgliedschafts-Log, Audit-Log.
3. **Web-App und PWA** – Konto, Geräte, Firma, Tresore, Gruppen, Einträge, Verwaltung.
4. **Extension** – Popup, Inline-Menü, Ausfüllen, Speichern, Passkeys; Chrome, Edge, Firefox,
   Firefox für Android, Safari.
5. **Import und Export** – alle Formate aus dem Abschnitt unten.
6. **Team-Funktionen** – Einmal-Links, Erinnerungen, Richtlinien, Notfallzugriff, Anmeldung per
   OpenID Connect mit Gruppen, CLI.
7. **Härtung** – alle ETH-Angriffe abgewehrt, reproduzierbare Builds, Demo ohne Server, Doku,
   Screenshots.
8. **Mobile-App** – ganz am Schluss: Tauri 3 mit Autofill für Android; das iOS-Projekt wird angelegt,
   die iOS-App selbst baut ein Mensch auf einem Mac.

Was nur Menschen erledigen können, alles nach dem Loop:

- iOS-App: AutoFill-Extension in Xcode, Signatur, App Store.
- Signatur-Schlüssel für Release-Manifest, Extension und Apps erzeugen und verwahren; bis dahin
  signiert der Loop mit einem Test-Schlüssel (`KENNWORT_RELEASE_KEY`, P-16).
- Store-Einreichungen (Chrome, Firefox, Edge, App Store, Play) und Antworten auf Reviews.
- Pilotbetrieb bei einem echten Betrieb.
- Externes Audit (z. B. Cure53) vor der Veröffentlichung; Befunde arbeitet der Loop ab.

## Tests

Jeder Punkt gilt erst als fertig, wenn seine Tests grün sind; alles außer den menschlichen
Prüfungen läuft in CI.

| Art | Was geprüft wird | Werkzeug |
| --- | --- | --- |
| Unit-Tests | reine Logik neben dem Code | Vitest |
| E2E | was ein Benutzer tut, Desktop und `@phone`; in CI in drei parallelen Teilen | Playwright |
| Krypto-Testvektoren | feste Ein- und Ausgaben je Baustein, Abgleich mit libsodium | Vitest, libsodium nur dev |
| Property-Tests | z. B. Entschlüsseln ergibt immer das Original, falsche AAD schlägt immer fehl | fast-check |
| Mutation-Tests | erkennen die Tests eine absichtliche Abweichung in `packages/crypto` und `packages/core`? Jede Nacht und auf Knopfdruck (`.github/workflows/mutation.yml`) in vier parallelen Teilen, nicht in CI: CI bleibt unter fünf Minuten, ein voller Lauf dauert bis zu 40; ein roter Lauf wird zuerst behoben | Stryker |
| Bösartiger Server | manipulierter Testserver mit den Angriffen der ETH-Studie; der Client erkennt jeden | Vitest, Playwright |
| Extension im echten Browser | Inline-Menü und Ausfüllen auf Testseiten, auch Phishing-Domain, fremdes iFrame, überdecktes Menü; Speichern und Aktualisieren, auch verstecktes Passwortfeld, Absenden per Skript und verdeckte Leiste; Phishing-Warnung, auch richtiger Host, verstecktes Feld, von der Seite gesetzter Wert, gesperrt und verdeckte Warnung | Playwright mit geladener Extension in Chromium |
| Extension in Firefox und WebKit | das gebaute Popup jedes Builds entsperrt in seiner Engine gegen den Test-Server; Ausfüllen nur auf exaktem Host, nie in fremde Frames, nicht bei verdecktem Menü und nicht in versteckte Felder, im Code von Content Script und Service Worker; in CI beide in einem Job neben den e2e-Teilen | Playwright (Firefox, WebKit), `e2e/engines` |
| Kompatibilität der Clients | was Web-App, Extension, App und CLI verschlüsseln, lesen alle anderen | gemeinsame Testvektoren |
| Sync und Offline | zwei Geräte ändern offline denselben Eintrag, nach dem Abgleich geht nichts verloren | Vitest, Playwright |
| Import-Parser | echte, anonymisierte Exportdateien je Anbieter; kaputte oder böswillige Dateien stürzen nie ab und hängen nie | Fixtures, Fuzzing mit fast-check |
| Updates | Datenbank-Migrationen und ältere Formatversionen bleiben lesbar | Vitest |
| Ernstfälle | Austritt mit Schlüsselwechsel, Recovery-Kit, Notfallzugriff, Gerät verloren, Backup zurückspielen | Playwright |
| Mobile-App | Rust-Tests, Oberfläche mit `mockIPC`, Android-Autofill im Emulator | cargo test, Playwright, Emulator |
| Server unter Last | viele Geräte gleichzeitig mit Live-Sync | Lasttest-Skript mit Bun |
| CI-Gates | erlaubte Laufzeit-Pakete, Bundle-Größe, CSP, Barrierefreiheit, reproduzierbarer Build von Web-App, Extension und Server (zweimal bauen, Hashes vergleichen) | eigene Checks, axe, `bun run reproducible` |
| Menschen | Pilotbetrieb, externes Audit | – |

## Dokumentation, Screenshots und Demo

Wie bei Kontext: Doku mit Zensical auf Deutsch, Screenshots per Workflow und eine Demo ohne Server,
alles auf GitHub Pages.

- **Doku**: Zensical in `docs/`, auf GitHub Pages unter kennwort.app, nur Deutsch;
  `zensical build --strict` gehört zu den Checks, wenn sich `docs/` ändert. Die Startseite ist
  zugleich die Produkt-Website (Hero, Rundgang in Screenshots, Vertrauen, Umstieg), wie bei
  kontext.email. Seiten: Überblick, Installation, Sicherheitsdesign, Import und Export, Extension,
  Handy und App, Verwaltung, FAQ, Datenschutz.
- **Screenshots**: Workflow „Update screenshots“ mit Playwright für Web-App, Extension-Popup,
  Inline-Menü und Handy, hell und dunkel; nach jeder Änderung am Aussehen schaut sich der Agent die
  neuen Bilder an.
- **Demo ohne Server**: die Web-App unter `/demo/` der Doku-Seite mit einem Server-Ersatz im
  Browser, der verschlüsselte Daten nur im Speicher hält; derselbe Ersatz dient den Tests.
  Testdaten „Weber Haustechnik“, deutlicher Hinweis, keine echten Passwörter einzugeben. Niedrige
  Priorität, Bauphase 8.

## Handy und Mobile-App

Am Handy bietet Kennwort dauerhaft beides an: die PWA ohne Installation und die Tauri-3-App, die
systemweit ausfüllt. In Firefox für Android läuft zusätzlich die Extension.

| Angebot | Wann | Ausfüllen am Handy |
| --- | --- | --- |
| PWA | Bauphase 3 | Kopieren mit einem Tipp; Zwischenablage wird nicht automatisch geleert |
| Extension in Firefox für Android | Bauphase 4 | Inline-Menü wie am Desktop |
| Tauri-3-Mobile-App | Bauphase 8 (iOS von Hand) | systemweit in allen Apps und Browsern, dazu Passkeys |

Wer was nutzt: Die **App** ist für alle, die täglich am Handy ausfüllen. Die **PWA** bleibt für
Aushilfen, fremde oder geteilte Geräte, Baustellen-Tablets und alle, die nichts installieren wollen
oder dürfen, auch auf dem iPhone ohne App Store. Beide nutzen dieselben Pakete (`packages/ui`,
`packages/core`, `packages/crypto`).

**Tauri 3**: Stand 19.11.2026 ist 3.0.0-alpha.6 (6.11.2026) aktuell, der 3.0-Meilenstein zu 31 %
erledigt; stabil ist Tauri 2.12. Die App kommt als letzte Bauphase, damit Tauri 3 bis dahin
möglichst stabil ist; ist es dann nicht stabil, nimmt der Loop die neueste Alpha oder 2.x.

Aufbau:

- Oberfläche aus `packages/ui`, Kryptografie aus `packages/crypto` im WebView; der Rust-Kern bleibt
  dünn.
- Account Key mit Biometrie im iOS-Schlüsselbund bzw. Android Keystore verpackt.
- Natives Plugin je Plattform: Android `AutofillService` (Kotlin, seit Chrome 135 auch in Chrome
  nutzbar) baut der Loop; die iOS AutoFill-Credential-Provider-Extension (Swift, eigenes
  Xcode-Target) mit Passkeys baut ein Mensch auf einem Mac.
- Zwischenablage nach 30 s leeren, Bildschirmschutz gegen Screenshots in der Eintragsansicht.

Verteilung:

- **Android**: APK in den GitHub-Releases, Updates über Obtainium oder ein eigenes F-Droid-Repo,
  optional Play Store. Googles Entwickler-Verifizierung für Apps außerhalb des Play Stores (ab 2026
  schrittweise) beachten.
- **iPhone**: nur über Apple – App Store, öffentlich oder als Unlisted App; für Firmen auch als
  Custom App über Apple Business Manager.
- **Lizenz**: Die App-Store-Bedingungen gelten als unvereinbar mit der AGPL; entschieden ist ein CLA
  für Beitragende (siehe Entscheidungen).

## Import und Export

Wer wechselt, nimmt alles mit: Einträge, Ordner, geteilte Ordner, TOTP, Notizen und eigene Felder.
Der Import läuft komplett im Client; die Datei verlässt nie das Gerät und wird nie hochgeladen.

| Von | Format |
| --- | --- |
| Bitwarden / Vaultwarden | JSON (auch Organisationen und Sammlungen), verschlüsseltes JSON, CSV |
| LastPass | CSV aus dem Web-Tresor (geteilte Ordner als Gruppen) |
| 1Password | 1PUX, CSV |
| KeePass / KeePassXC | KDBX 4, KeePass-2-XML, CSV |
| Team Password Manager | CSV (Projekte als Tresore) |
| Passbolt | CSV, KDBX |
| Dashlane, Proton Pass, Keeper, NordPass, Enpass | CSV bzw. JSON/ZIP |
| Chrome, Edge, Firefox, Safari / Apple Passwörter | CSV |
| Beliebige Tabelle | CSV mit Spaltenzuordnung |
| Jeder Manager mit FIDO Credential Exchange (CXF/CXP) | verschlüsselte Übertragung, auch Passkeys; sobald der Standard stabil ist |
| Google Authenticator, Aegis, 2FAS, Microsoft Authenticator | Export-QR-Code (otpauth-migration) bzw. JSON-Export; Microsoft soweit dessen Export es erlaubt; TOTP wird dem passenden Login zugeordnet |

Ablauf:

1. Anbieter wählen; Kennwort zeigt in wenigen Schritten, wo dort der Export ist.
2. Datei laden; Vorschau mit Zuordnung: ein Ziel-Tresor, Ordner und Sammlungen auf Wunsch als Tags
   (Tresore aus Ordnern und geteilte Ordner als geteilte Tresore mit Gruppen folgen später), bei
   einer beliebigen Tabelle die Spalten.
3. Doppelte Einträge erkennen und überspringen, außer man nimmt sie trotzdem; schwache Passwörter
   markieren, sie stehen danach unter „Zum Ändern“.
4. Verschlüsseln und hochladen; danach Hinweis, die unverschlüsselte Exportdatei zu löschen.

Umsetzung: ein Parser pro Format als reine Funktion in `packages/core` (Datei rein, Einträge raus),
getestet mit echten, anonymisierten Exportdateien je Anbieter als Fixtures. KDBX wird mit den
`@noble`-Bausteinen gelesen (Argon2, ChaCha20, AES), ohne zusätzliche Bibliothek.

**Export ohne Lock-in**: eigener verschlüsselter Export (JSON mit Passwort), CSV, KDBX und CXF,
sobald verfügbar. Exportieren dürfen nur Verwalter – Inhaber und Admins der Firma –, und es landet
im Audit-Log.

## Funktionsumfang 1.0

Die vollständige Liste mit Bauphasen und Akzeptanzkriterien steht in der
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md). Version 1.0 ist fertig,
wenn dort alles abgehakt ist und die menschlichen Schritte erledigt sind.

## Offene Fragen

- Marke: „Kennwort“ als Wort-Bild-Marke anmelden? Store-Namen prüfen (Chrome, Firefox, App Store,
  Play).
- Liefert Stalwart selbst einen groups-Claim, oder bekommt ihn Kontexts OIDC-Provider dazu?
- Ab wann Budget für das externe Audit, und welcher Prüfer?
- Aktueller Stand von Googles Entwickler-Verifizierung für APKs außerhalb des Play Stores?
- Bringt Tauri 3 für Mobile genug, um auf die stabile Version zu warten?

## Quellen

- [iTnews: Schwachstellen in Cloud-Passwortmanagern (ETH-Studie)](https://www.itnews.com.au/news/researchers-find-critical-vulnerabilities-in-cloud-based-password-managers-623661)
- [CyberInsider: Passwortmanager halten Zero-Knowledge nicht ein](https://cyberinsider.com/popular-password-managers-fall-short-of-zero-knowledge-claims/)
- [Passbolt: v5 encrypted metadata](https://www.passbolt.com/docs/development/resources/v5-encrypted-metadata/)
- [solid-js 2.0.0 Release](https://newreleases.io/project/github/solidjs/solid/release/solid-js@2.0.0)
- [tech-stack.md in firsttris/workflows](https://github.com/firsttris/workflows/blob/main/tech-stack.md)
- [Tauri auf lib.rs (Versionen 2.x und 3.0-Alpha)](https://lib.rs/crates/tauri)
- [Tauri 3.0-Meilenstein auf GitHub](https://github.com/tauri-apps/tauri/milestone/5)

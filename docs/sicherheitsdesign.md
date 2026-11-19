---
title: Sicherheitsdesign
description: >-
  Wie Kennwort verschlüsselt: Bedrohungsmodell mit bösartigem Server, Schlüsselhierarchie, jedes
  Format mit Version und alle Protokolle von Konto bis Notfallzugriff – und was der Server sieht.
---

# Sicherheitsdesign

Dieses Dokument legt fest, wie Kennwort verschlüsselt, signiert und prüft. Es ist die Vorgabe für
`packages/crypto`, `packages/core` und den Sync: Code, der davon abweicht, ist ein Fehler, und eine
Änderung an einem Format braucht eine neue Formatversion und neue Testvektoren. Das Warum steht im
[Projektplan](plan.md); hier steht das Wie.

Die Leitidee: **Der Server ist nicht vertrauenswürdig.** Er speichert und verteilt nur Geheimtexte,
signierte Einträge und öffentliche Schlüssel. Alles, was über Zugriff entscheidet, prüft der Client
selbst.

## Bedrohungsmodell

### Wer angreift

| Angreifer | Kann | Kann nicht |
| --- | --- | --- |
| **Bösartiger Server** (gehackt, erpresst oder böswilliger Betreiber) | jede Antwort fälschen, weglassen, vertauschen, alte Antworten wiederholen, verschiedenen Clients Verschiedenes zeigen, Konten und Einladungen anlegen, Wartezeiten und Abruf-Grenzen ignorieren | Geheimtexte lesen oder unbemerkt ändern, Signaturen fälschen, Clients mit gültigen Schlüsseln Zugriff verschaffen |
| **Dieb der Datenbank** | alles lesen, was der Server speichert, und offline raten | eine Passphrase ohne den Secret Key raten |
| **Netzwerk** | mitlesen, wo TLS fehlt | mehr als der Server (TLS ist zusätzlich, nicht tragend) |
| **Phishing-Seite** | das Ausfüllen erbitten, Menüs überdecken | ausfüllen lassen ohne exakten Host-Treffer und Klick |
| **Ehemaliges Mitglied** | behalten, was es schon entschlüsselt hat | neue Einträge und neue Tresor-Schlüssel lesen |
| **Anmeldedienst (OIDC)** | Konten anlegen und Gruppen melden | entschlüsseln oder Zugriff geben; ein Gruppenwechsel ist nur eine Anfrage |

Außerhalb des Modells: Schadsoftware auf dem entsperrten Gerät, ein Angreifer mit dem entsperrten
Gerät in der Hand, eine kompromittierte Browser- oder Betriebssystem-Installation und die erste
Begegnung mit dem Firmen-Wurzelschlüssel (TOFU, siehe [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)).

### Angriffskatalog nach der ETH-Studie

Die Studie der ETH Zürich und der USI (Scarlata, Torrisi, Backendal, Paterson: „Zero Knowledge
(About) Encryption“, USENIX Security 2026) zeigt, wie ein bösartiger Server Bitwarden, LastPass,
Dashlane und 1Password angreift. Ihre Angriffe fallen in vier Klassen: Schlüsselhinterlegung
(Key Escrow) über Wiederherstellung, Organisationen und SSO; ungeprüfte öffentliche Schlüssel beim
Teilen; Schwächen der Verschlüsselung einzelner Einträge (vertauschte Felder, verschobene
Geheimtexte, ungeschützte Metadaten); und Rückwärtskompatibilität, über die der Server alte,
schwächere Verfahren erzwingt.

Kennwort führt daraus einen eigenen Katalog mit 27 Angriffen, ergänzt um die Angriffe, die erst
durch Kennworts Funktionen möglich werden (Geräte-Freigabe, Einmal-Links, OIDC-Gruppen). Jedes
Protokoll unten nennt, welche es abwehrt; der bösartige Testserver (K-206, K-701) spielt jeden als
Test nach. Die Zuordnung zur Nummerierung der Studie trägt K-701 nach, sobald die Studie in der
Umgebung des Loops lesbar ist; die Klassen und Mechanismen hier folgen den veröffentlichten
Zusammenfassungen.

| Nr. | Klasse | Angriff des Servers |
| --- | --- | --- |
| E-01 | Key Escrow | meldet ein Konto heimlich bei einer Kontowiederherstellung an, deren Schlüssel er kennt |
| E-02 | Key Escrow | schreibt ein Konto in eine Firma oder Organisation ein, die er steuert, und lässt sich Schlüssel verpacken |
| E-03 | Key Escrow | gibt sich als SSO-Schlüsseldienst aus und liefert oder empfängt den Account Key |
| E-04 | Key Escrow | gewährt einem Angreifer Notfallzugriff oder verkürzt die Wartezeit |
| E-05 | Öffentliche Schlüssel | tauscht beim Teilen den öffentlichen Schlüssel eines Mitglieds gegen seinen eigenen |
| E-06 | Öffentliche Schlüssel | nimmt heimlich ein Mitglied in einen Tresor auf |
| E-07 | Öffentliche Schlüssel | lässt Einträge des Mitgliedschafts-Logs aus, vertauscht sie, schiebt unsignierte ein oder spielt einen alten Stand zurück |
| E-08 | Öffentliche Schlüssel | zeigt verschiedenen Mitgliedern verschiedene Logs (Gabelung) |
| E-09 | Öffentliche Schlüssel | registriert ein Gerät des Angreifers im Konto |
| E-10 | Öffentliche Schlüssel | tauscht den Firmen-Wurzelschlüssel oder den Firmen-Recovery-Schlüssel aus |
| E-11 | Einträge | vertauscht Felder innerhalb eines Eintrags (Passwort und Notiz, URL und Titel) |
| E-12 | Einträge | verschiebt Geheimtexte zwischen Einträgen oder Tresoren |
| E-13 | Einträge | spielt eine alte Version eines Eintrags zurück |
| E-14 | Einträge | liest oder ändert ungeschützte Metadaten, etwa die URL, damit auf seiner Domain ausgefüllt wird |
| E-15 | Einträge | löscht oder verbirgt Einträge unbemerkt |
| E-16 | Einträge | schiebt einen Eintrags- oder Tresor-Schlüssel unter, den er kennt, damit neue Daten damit verschlüsselt werden |
| E-17 | Rückwärtskompatibilität | erzwingt ein altes, nicht authentisiertes Verschlüsselungsformat |
| E-18 | Rückwärtskompatibilität | senkt die Parameter der Schlüsselableitung, um die Passphrase leichter zu raten |
| E-19 | Rückwärtskompatibilität | erzwingt eine alte Protokollversion, etwa eine ohne Signaturprüfung |
| E-20 | Teilen nach außen | liest einen Einmal-Link oder ruft ihn öfter ab als erlaubt |
| E-21 | Teilen nach außen | schiebt bei Import oder Export Einträge unter oder liest sie mit |
| E-22 | Ausgelieferter Code | liefert eine manipulierte Web-App aus |
| E-23 | Nachvollziehbarkeit | fälscht oder kürzt das Audit-Log |
| E-24 | Anmeldung | greift beim Anmelden die Passphrase oder etwas ab, mit dem er sie raten kann |
| E-25 | Geräte | leitet die Freigabe eines neuen Geräts auf seinen eigenen Schlüssel um |
| E-26 | Austritt | gibt einem ausgetretenen Mitglied weiter Zugriff auf neue Daten |
| E-27 | Anmeldung | macht aus einem Gruppenwechsel beim Anmeldedienst einen Zugriff ohne Verwalter |

### Abdeckung des Projektplans

Jede Zeile des Bedrohungsmodells und jede Regel der Kryptografie aus dem Projektplan hat hier ein
Protokoll. Ein Test (`scripts/security-design.test.ts`) hält diese Tabelle mit dem Projektplan
gleich.

| Aus dem Projektplan | Protokolle | Angriffe |
| --- | --- | --- |
| Datenbank gestohlen | [P-01](#p-01-konto-anlegen), [P-03](#p-03-entsperren), [P-15](#p-15-was-der-server-sieht) | E-18, E-24 |
| Später mit Quantenrechner entschlüsseln | [F-02](#f-02-an-einen-offentlichen-schlussel-verpackt-v1), [P-05](#p-05-tresor-anlegen-und-mitglieder-aufnehmen) | – |
| Server nimmt heimlich jemanden in einen Tresor auf | [P-06](#p-06-mitgliedschafts-log) | E-06, E-07, E-08 |
| Server schiebt fremden öffentlichen Schlüssel unter | [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate), [P-08](#p-08-einladung) | E-05, E-10 |
| Server vertauscht Einträge oder spielt alte Stände ein | [P-09](#p-09-eintrage-speichern-und-lesen) | E-11, E-12, E-13, E-14, E-15, E-16 |
| Server liefert manipulierte Web-App aus | [P-16](#p-16-ausgelieferter-code) | E-22 |
| Phishing-Seite will Autofill | [P-17](#p-17-ausfullen) | E-14 |
| Clickjacking auf das Autofill-Menü (DEF CON 2025) | [P-17](#p-17-ausfullen) | – |
| Supply-Chain im Client | [P-16](#p-16-ausgelieferter-code) | E-22 |
| SSO-Konto übernommen | [P-02](#p-02-anmelden), [P-03](#p-03-entsperren) | E-03, E-27 |
| Mitarbeiter verlässt Firma | [P-11](#p-11-austritt-und-schlusselwechsel) | E-26 |
| Malware auf dem Gerät | [P-03](#p-03-entsperren) (Sperren, Schlüssel nur im Speicher) | – |
| Passwort bleibt am Handy in der Zwischenablage | [P-17](#p-17-ausfullen) | – |
| Anmeldung durchprobieren | [P-02](#p-02-anmelden) | E-24 |
| AAD | [F-01](#f-01-geheimtext-v1), [P-09](#p-09-eintrage-speichern-und-lesen) | E-11, E-12, E-13 |
| Signiertes Mitgliedschafts-Log | [P-06](#p-06-mitgliedschafts-log) | E-06, E-07, E-08 |
| Firmen-Wurzelschlüssel | [P-07](#p-07-firmen-wurzelschlussel-und-zertifikate) | E-02, E-05, E-10 |
| Austritt | [P-11](#p-11-austritt-und-schlusselwechsel) | E-26 |
| Neues Gerät | [P-04](#p-04-neues-gerat) | E-09, E-25 |
| Login per Passkey/SSO | [P-02](#p-02-anmelden) | E-24, E-27 |
| Symmetrisch | [F-01](#f-01-geheimtext-v1) | E-17 |
| Schlüssel verpacken | [F-02](#f-02-an-einen-offentlichen-schlussel-verpackt-v1) | E-05, E-16 |
| Signaturen | [F-03](#f-03-signatur-v1) | E-07, E-19 |
| Passphrase | [F-05](#f-05-ableitung-aus-der-passphrase-v1), [P-03](#p-03-entsperren) | E-18 |
| Entsperren | [P-03](#p-03-entsperren) | E-03 |
| Ableitung | [F-04](#f-04-kodierung-und-ableitung) | – |

## Bausteine

Nur standardisierte Verfahren aus `@noble/*`, nichts selbst gebaut:

| Zweck | Verfahren | Quelle | Bibliothek |
| --- | --- | --- | --- |
| Symmetrisch | XChaCha20-Poly1305, 256-Bit-Schlüssel, 192-Bit-Nonce | RFC 8439, draft-irtf-cfrg-xchacha | `@noble/ciphers` |
| Hybrid-KEM | X-Wing: X25519 + ML-KEM-768 | draft-connolly-cfrg-xwing-kem, FIPS 203 | `@noble/post-quantum` |
| Signaturen | Ed25519 | RFC 8032 | `@noble/curves` |
| Ableitung | HKDF-SHA-512 | RFC 5869 | `@noble/hashes` |
| Passphrase | Argon2id | RFC 9106 | `@noble/hashes` |
| Hash | SHA-512, SHA-512/256; SHA-256 nur für Release-Manifeste (wie Subresource Integrity) | FIPS 180-4 | `@noble/hashes` |
| Zufall | `crypto.getRandomValues` | Web Crypto | über `@noble/hashes/utils` |

## Formate

Jedes Format beginnt mit einem Byte für seine Version. Ein Client liest nur Versionen, die er
kennt, und fällt nie auf eine ältere zurück, weil der Server es verlangt: Eine unbekannte oder
abgekündigte Version ist ein Fehler, keine Einladung zum Ausweichen (E-17, E-19). Neue Versionen
kommen mit neuen Testvektoren; alte bleiben lesbar, bis ein Client sie beim nächsten Schreiben in
die neue überführt.

### F-04 Kodierung und Ableitung

- **Kodierung** `enc(t₁, …, tₙ)`: jedes Teil als 4-Byte-Länge (Big Endian) und seine Bytes.
  Zeichenketten als UTF-8 in NFC (nur wohlgeformte; ein einzelnes Surrogat ist ein Fehler), Zahlen als 8 Byte Big Endian, IDs als ihre 16 Bytes (UUIDv7).
  So ist jede Folge von Teilen eindeutig und kein Teil kann in ein anderes überlaufen.
- **Kontext**: Jede Verwendung trägt eine Bezeichnung `kennwort/<zweck>/v<n>` als erstes Teil;
  derselbe Schlüssel in zwei Zwecken ergibt nie dieselbe Eingabe.
- **Ableitung**: `kdf(ikm, salt, zweck, …) = HKDF-SHA-512(ikm, salt, info = enc(zweck, …), L = 32)`.
- **Fingerabdruck** eines öffentlichen Schlüsselbündels: `SHA-512/256(enc("kennwort/fp/v1", xwingPk, edPk))`;
  angezeigt als Vergleichscode aus 12 Gruppen zu 5 Ziffern. Für Schlüssel, die allein stehen:
  Wurzelschlüssel `SHA-512/256(enc("kennwort/fp-root/v1", edPk))`, Firmen-Recovery-Schlüssel
  `SHA-512/256(enc("kennwort/fp-recovery/v1", xwingPk))`.

### F-01 Geheimtext v1

```text
0x01 ‖ nonce (24 Byte, zufällig) ‖ XChaCha20-Poly1305(schlüssel, nonce, klartext, aad) (n + 16 Byte)
aad = enc("kennwort/box/v1", zweck, kontext₁, …, kontextₙ)
```

Der Kontext bindet den Geheimtext an seinen Ort: bei einem Eintrag Tresor-ID, Eintrags-ID und
Version, bei einem verpackten Schlüssel die IDs von Besitzer und Ziel. Ein Geheimtext, der an einen
anderen Ort geschoben wird, lässt sich dort nicht entschlüsseln (E-11, E-12, E-13). Das Versions-Byte
steht in der Bezeichnung der AAD; ein umgeschriebenes Byte scheitert an der Prüfung.

Umgesetzt in `packages/crypto/src/box.ts`; die Testvektoren in `packages/crypto/vectors/box-v1.json`
rechnet libsodium aus, nicht der Code, den sie prüfen.

### F-02 An einen öffentlichen Schlüssel verpackt v1

```text
(ss, ct) = X-Wing.Encaps(pkₓ)                       ct: 1120 Byte, ss: 32 Byte
k        = kdf(ss, leer, "kennwort/wrap/v1", fp(empfänger), zweck, kontext…)
paket    = 0x01 ‖ ct ‖ F-01-Geheimtext(k, nutzlast, zweck = "wrap", kontext = fp(empfänger), zweck, kontext…)
```

X-Wing bindet das gemeinsame Geheimnis an Geheimtext und öffentlichen Schlüssel; der Fingerabdruck
des Empfängers in Ableitung und AAD bindet das Paket zusätzlich an das ganze Schlüsselbündel. Damit
ist die Verpackung so sicher wie der stärkere der beiden Teile: X25519 heute, ML-KEM-768 gegen einen
späteren Quantenrechner. Wer verpackt, nimmt den öffentlichen Schlüssel nur aus einem geprüften
Zertifikat ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)), nie roh vom Server (E-05).

F-02 sagt nichts darüber, **wer** verpackt hat: Mit einem öffentlichen Schlüssel kann jeder, auch der
Server, ein gültiges Paket bauen. Ein entpackter Schlüssel gilt deshalb erst, wenn er zu einer
**Bindung** passt, die ein Berechtigter signiert hat:

```text
bindung(schlüssel, zweck, kontext…) = kdf(schlüssel, leer, "kennwort/key-commit/v1", zweck, kontext…)
```

Die Bindung verrät den Schlüssel nicht (HKDF ist eine Einwegfunktion) und steht im signierten
Log-Eintrag, in der signierten Freigabe, im signierten Notfall-Paket oder in der signierten
Firmen-Recovery-Hinterlegung. Ein Paket ohne passende signierte Bindung wird verworfen (E-16).
Zwei Fälle prüfen anders:

- **Private Schlüssel** (Firmen-Wurzelschlüssel, Firmen-Recovery-Schlüssel): Der öffentliche
  Schlüssel ist die Bindung seines privaten. Der Client leitet ihn aus dem entpackten privaten
  Schlüssel ab und vergleicht ihn mit dem gemerkten Wurzel-Fingerabdruck aus dem Schlüsselblock bzw.
  mit dem Fingerabdruck des Recovery-Schlüssels in der vom Wurzelschlüssel signierten Richtlinie.
- **Das Paket an ein neues Gerät** ([P-04](#p-04-neues-gerat)): Dort prüfen der QR-Code und der
  Vergleichscode auf beiden Geräten, wer verpackt hat.

### F-03 Signatur v1

```text
signatur = 0x01 ‖ Ed25519.Sign(sk, enc("kennwort/sig/v1", zweck, feld₁, …, feldₙ))   64 Byte + 1
```

Jede Signatur nennt ihren Zweck; eine Signatur für einen Log-Eintrag gilt nie als Zertifikat oder
umgekehrt. Geprüft wird streng nach RFC 8032 (kanonisches S, kein Punkt kleiner Ordnung).

### F-05 Ableitung aus der Passphrase v1

```text
parameter  = Argon2id, m = 64 MiB, t = 3, p = 1, 32 Byte Ausgabe          (fest in v1)
p₁         = Argon2id(NFKC(passphrase), salt = enc("kennwort/argon2/v1", kontoSalt (16 Byte)))
entsperren = kdf(p₁, secretKey (16 Byte), "kennwort/unlock-passphrase/v1", konto-ID)
anmelden   = kdf(p₁, secretKey (16 Byte), "kennwort/login/v1", konto-ID)
```

Die Parameter gehören zur Formatversion und stehen nicht in der Datenbank; der Server kann sie
nicht senken (E-18). Stärkere Parameter heißen v2. Der **Secret Key** sind 128 zufällige Bits, die
nur auf den Geräten und im Recovery-Kit liegen, angezeigt als `K1-` und 26 Zeichen Crockford-Base32
mit Prüfziffer. Ohne ihn ist eine gestohlene Datenbank auch mit schwacher Passphrase nicht zu raten.

### F-06 Schlüsselbündel und Zertifikat v1

```text
bündel     = enc("kennwort/bundle/v1", konto-ID, xwingPk (1216 Byte), edPk (32 Byte))
zertifikat = enc(bündel, firmen-ID, rolle, ausgestellt-am) ‖ F-03-Signatur(wurzel, "certificate", …)
```

## Schlüsselhierarchie

```text
Passkey (PRF) ──────────────┐
Passphrase + Secret Key ────┼─► Account Key AK (256 Bit, zufällig)
Recovery-Kit ───────────────┤        │  verschlüsselt (F-01)
Firmen-Recovery (F-02) ─────┘        ├─► X-Wing-Schlüssel des Benutzers
                                     └─► Ed25519-Schlüssel des Benutzers
Tresor-Schlüssel VKₑ (je Epoche e) ◄── pro Mitglied an dessen X-Wing-Schlüssel verpackt (F-02)
      │  verschlüsselt (F-01)
Eintrags-Schlüssel EK ─► Eintrag (alle Felder in einem Geheimtext, F-01)
```

| Schlüssel | Entsteht | Liegt verschlüsselt | Kontext (AAD) |
| --- | --- | --- | --- |
| AK | zufällig beim Konto | unter jedem Entsperr-Weg | Konto-ID, Weg (`passkey`, `passphrase`, `recovery`, `company`), bei Passkeys die Credential-ID |
| Schlüsselblock: Benutzer-Schlüssel und Fingerabdruck des Firmen-Wurzelschlüssels | beim Konto | unter AK | Konto-ID |
| VKₑ | zufällig beim Anlegen und bei jedem Schlüsselwechsel | an jedes Mitglied verpackt; seine Bindung steht im signierten Log | Tresor-ID, Epoche, Konto-ID des Mitglieds |
| EK | zufällig je Eintrag und neu bei jedem Schlüsselwechsel | unter VKₑ | Tresor-ID, Eintrags-ID, Epoche |
| Inhalt | – | unter EK | Tresor-ID, Eintrags-ID, Version |

Was ein Client sich merkt, um den Server zu prüfen, liegt im **Kontozustand**: Fingerabdruck des
Firmen-Wurzelschlüssels, bekannte Schlüsselbündel, der letzte Stand jedes Mitgliedschafts-Logs und
die höchste Version jedes Eintrags. Er ist ein F-01-Geheimtext unter AK (Zweck `account-state`,
Kontext Konto-ID und ein Zähler) auf dem Server; jedes Gerät lädt ihn beim Entsperren, führt ihn
mit seinem eigenen Stand zusammen (der höhere Stand gewinnt, ein anderer Wurzelschlüssel ist ein
Angriff) und schreibt ihn mit höherem Zähler zurück. So kennt jedes Gerät eines Kontos, auch eines,
das mit Passphrase oder Recovery-Kit entsperrt, was das erste Gerät geprüft hat. P-01 legt den
ersten Kontozustand (Zähler 0) an, bevor das Konto benutzbar ist; fehlt er später, warnt der Client
und behandelt das als Angriff, nicht als neues Konto. Spielt der Server einen älteren Kontozustand
zurück, verliert ein neues Gerät höchstens Stände, die jünger sind als dieser.

Der **Fingerabdruck des Firmen-Wurzelschlüssels** steht zusätzlich im **Schlüsselblock**, dem
Geheimtext unter AK mit den privaten Schlüsseln des Benutzers. Ohne Schlüsselblock kann kein Gerät
etwas entschlüsseln; der Server kann ihn also nicht weglassen, und jedes Gerät, das AK hat – über
Passkey, Passphrase, Recovery-Kit, neues Gerät oder Firmen-Recovery –, hat damit auch den geprüften
Wurzelschlüssel.

Entsperrte Schlüssel liegen nur im Speicher (in der Extension in `chrome.storage.session`), nie in
`localStorage`, IndexedDB oder auf dem Server.

## Protokolle

Jedes Protokoll nennt, welche Angriffe des Katalogs es abwehrt. „Restrisiko“ nennt ehrlich, was
bleibt.

### P-01 Konto anlegen

1. Der Client erzeugt AK, Secret Key, Konto-Salt, X-Wing- und Ed25519-Schlüssel.
2. Er verschlüsselt den Schlüsselblock (private Schlüssel und den Fingerabdruck des
   Wurzelschlüssels aus der Einladung, [P-08](#p-08-einladung); beim Inhaber den eigenen) und den
   ersten Kontozustand unter AK (F-01) und AK unter jedem Entsperr-Weg
   ([P-03](#p-03-entsperren)).
3. Er erzeugt das Recovery-Kit ([P-12](#p-12-recovery-kit)) und lässt es sichern, bevor das Konto
   benutzbar ist.
4. Zum Server gehen nur: Konto-ID, Konto-Salt, die Geheimtexte (Schlüsselblock, Kontozustand,
   verpackter AK), das Schlüsselbündel (F-06) und der öffentliche Anmelde-Schlüssel
   ([P-02](#p-02-anmelden)).

**Wehrt ab:** E-10, E-18, E-24.

### P-02 Anmelden

Anmelden (beim Server) und Entsperren (der Schlüssel) sind getrennt; Anmelden gibt nur Zugang zu
Geheimtexten.

- **Passkey** über Better Auth (WebAuthn); derselbe Passkey kann zugleich per PRF entsperren.
- **OpenID Connect**: Der Anmeldedienst bestätigt nur, wer jemand ist. Er entschlüsselt nichts; ein
  Gruppenwechsel erzeugt eine Zugriffsanfrage, die ein Verwalter freigibt
  ([P-05](#p-05-tresor-anlegen-und-mitglieder-aufnehmen)).
- **Notweg Passphrase**: Aus `anmelden` (F-05) wird ein Ed25519-Schlüssel; der Server kennt nur
  dessen öffentlichen Teil und schickt eine Herausforderung. Die Passphrase und `p₁` verlassen nie
  das Gerät; was der Server speichert, lässt sich ohne den Secret Key nicht raten.
- Rate-Limits je Konto und Adresse, Sperre nach Fehlversuchen.

**Wehrt ab:** E-24, E-27, E-03.

### P-03 Entsperren

| Weg | Schlüssel, unter dem AK liegt |
| --- | --- |
| Passkey | `kdf(prf, credSalt, "kennwort/unlock-passkey/v1", credential-ID)`; `prf` ist die Ausgabe der WebAuthn-PRF-Erweiterung für das zufällige `credSalt` (32 Byte) dieses Passkeys |
| Passphrase | `entsperren` aus F-05 |
| Recovery-Kit | der Recovery Key ([P-12](#p-12-recovery-kit)) |
| Firmen-Recovery | F-02 an den Firmen-Recovery-Schlüssel ([P-13](#p-13-firmen-recovery)) |

Der Client lädt den passenden Geheimtext, leitet den Schlüssel ab und entschlüsselt AK; die AAD
nennt Konto und Weg, ein Geheimtext eines anderen Kontos oder Wegs scheitert. Welche Wege es gibt,
bestimmt der Client aus seinem letzten bekannten Stand: Ein neuer Weg, den der Server meldet, gilt
erst, wenn ein entsperrtes Gerät ihn angelegt hat (E-01, E-03). Nach Leerlauf sperrt der Client
und löscht alle Schlüssel aus dem Speicher.

**Wehrt ab:** E-01, E-03, E-18.

### P-04 Neues Gerät

1. Das neue Gerät erzeugt ein Einmal-Schlüsselpaar (X-Wing) und zeigt einen QR-Code mit
   Sitzungs-ID und öffentlichem Schlüssel.
2. Ein entsperrtes Gerät scannt ihn; der Schlüssel kommt so am Server vorbei.
3. Es verpackt AK, Konto-ID und den Hash seines aktuellen Kontozustands an den Einmal-Schlüssel
   (F-02, Zweck `device`) und schickt das Paket über den Server. Das neue Gerät lädt den
   Kontozustand und nimmt ihn nur an, wenn sein Hash passt.
4. Beide zeigen einen Vergleichscode aus `SHA-512/256(enc("kennwort/device/v1", pk, paket))`;
   erst nach Bestätigung auf beiden Geräten wird das Gerät eingetragen.

Ein Gerät, das der Server ohne diesen Ablauf einträgt, hat keinen AK; ein neues Gerät übernimmt
mit dem Kontozustand auch den geprüften Wurzelschlüssel und muss niemandem beim ersten Kontakt
trauen. Die Geräteliste zeigt jedes
Gerät, abmelden widerruft dessen Sitzung.

**Wehrt ab:** E-09, E-10, E-25.

### P-05 Tresor anlegen und Mitglieder aufnehmen

1. Anlegen: VK₀ zufällig; der Genesis-Eintrag des Mitgliedschafts-Logs
   ([P-06](#p-06-mitgliedschafts-log)) nennt den Anlegenden als Verwalter.
2. Aufnehmen: Ein Verwalter prüft das Zertifikat des neuen Mitglieds
   ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)), verpackt VKₑ an dessen X-Wing-Schlüssel
   (F-02) und signiert einen Log-Eintrag mit Konto, Fingerabdruck, Rolle (lesen, bearbeiten,
   verwalten), optional Ablaufzeit, und der Bindung von VKₑ.
3. Das neue Mitglied entpackt VKₑ und prüft die Bindung gegen den signierten Log-Eintrag seiner
   Epoche; ein Paket, das der Server mit einem eigenen Schlüssel gebaut hat, passt nicht (E-16).
4. Zugriff anfragen und OIDC-Gruppen: Der Server legt nur eine Anfrage ab; erst ein Verwalter
   führt Schritt 2 aus.

**Wehrt ab:** E-02, E-05, E-06, E-16, E-27.

### P-06 Mitgliedschafts-Log

Ein Log je Tresor, eine Hash-Kette signierter Einträge:

```text
eintrag = enc("kennwort/log/v1", tresor-ID, seq, vorgänger-hash, epoche, aktion, konto-ID,
              fingerabdruck, rolle, gültig-bis, vk-bindung, zeit, unterzeichner-ID, zuletzt-gesehen)
          ‖ F-03-Signatur(unterzeichner, "log", …)
hash    = SHA-512/256(eintrag)
aktion  ∈ { anlegen, aufnehmen, entfernen, rolle, schlüsselwechsel }
vk-bindung = bindung(VKₑ, "vault-key", tresor-ID, epoche)    (F-02; leer bei entfernen und rolle)
```

Der Client prüft bei jedem Abruf die ganze Kette ab seinem letzten Stand:

- `seq` lückenlos, `vorgänger-hash` passend, Genesis mit `seq = 0` und Null-Hash (ausgelassen,
  vertauscht, eingeschoben: E-07);
- jede Signatur gültig, der Unterzeichner zu diesem Zeitpunkt Verwalter, sein Schlüssel und der des
  Mitglieds durch die Firma zertifiziert (unsigniert, fremd: E-06, E-07);
- jeder VKₑ, den der Client entpackt, passt zur `vk-bindung` des Eintrags `anlegen` bzw.
  `schlüsselwechsel` seiner Epoche (untergeschobener Tresor-Schlüssel: E-16);
- der letzte Stand (`seq`, `hash`) wird gespeichert; ein kürzeres Log oder ein anderer Hash an
  bekannter Stelle ist ein Angriff, kein Update (zurückgespielt: E-07).

Gegen eine Gabelung (E-08) trägt jeder signierte Eintrag und jedes signierte Schreiben eines
Eintrags den zuletzt gesehenen Log-Stand; trifft ein Client auf einen Stand, der nicht in seiner
Kette liegt, warnt er. Restrisiko: Eine Gabelung fällt erst auf, wenn die getrennten Mitglieder
wieder etwas voneinander sehen.

**Wehrt ab:** E-06, E-07, E-08, E-16, E-19.

### P-07 Firmen-Wurzelschlüssel und Zertifikate

- Beim Anlegen der Firma erzeugt der Inhaber einen Ed25519-Wurzelschlüssel; der private Teil liegt
  an jeden Inhaber verpackt (F-02).
- Der Wurzelschlüssel signiert die Schlüsselbündel der Mitarbeiter (F-06) und die
  Firmen-Richtlinien, darunter den Firmen-Recovery-Schlüssel und ob Firmen-Recovery an ist.
- Clients merken sich den Fingerabdruck des Wurzelschlüssels beim ersten Kontakt (TOFU) und zeigen
  ihn zum Vergleich an. Ein anderer Wurzelschlüssel oder ein neues Bündel für ein bekanntes Konto
  löst eine deutliche Warnung aus und wird nicht stillschweigend übernommen.

- Der gemerkte Fingerabdruck steht im Schlüsselblock unter AK
  ([Schlüsselhierarchie](#schlusselhierarchie)), nicht nur auf einem Gerät: Jedes Gerät des Kontos
  prüft gegen ihn, auch eines, das mit Passphrase, Recovery-Kit oder Firmen-Recovery entsperrt.

Restrisiko: der erste Kontakt (TOFU) für Konten, die ohne Einladungslink entstehen (OIDC),
abgeschwächt durch den Vergleichscode. Wer per Link eingeladen wird, bekommt den Fingerabdruck im
Link ([P-08](#p-08-einladung)) und braucht auf keinem seiner Geräte TOFU; der Inhaber erzeugt den
Wurzelschlüssel selbst.

**Wehrt ab:** E-02, E-05, E-10.

### P-08 Einladung

1. Ein Verwalter erzeugt ein Einladungsgeheimnis `s` (256 Bit); der Link trägt `s` und den
   Fingerabdruck des Firmen-Wurzelschlüssels im Fragment (`#…`), das nie zum Server geht.
2. Der Client des Eingeladenen nimmt den Wurzelschlüssel nur an, wenn er zum Fingerabdruck im Link
   passt, und prüft damit die Firmen-Richtlinie, bevor er etwas an den Firmen-Recovery-Schlüssel
   verpackt ([P-13](#p-13-firmen-recovery)). Ein untergeschobener Wurzelschlüssel samt Richtlinie
   mit eigenem Recovery-Schlüssel scheitert hier (E-01, E-10).
3. Der Client des Eingeladenen legt das Konto an ([P-01](#p-01-konto-anlegen)) und schickt sein
   Bündel mit `HMAC-SHA-512(kdf(s, leer, "kennwort/invite/v1", einladungs-ID), bündel)`.
4. Der Client des Verwalters prüft den MAC und zertifiziert erst dann das Bündel
   ([P-07](#p-07-firmen-wurzelschlussel-und-zertifikate)).

Ein Bündel, das der Server unterschiebt, hat keinen gültigen MAC; ein Wurzelschlüssel, den er
unterschiebt, passt nicht zum Link. Die Einladung ist damit in beide Richtungen geprüft.

**Wehrt ab:** E-01, E-02, E-05, E-10.

### P-09 Einträge speichern und lesen

```text
eintrag   = { tresor-ID, eintrags-ID, version, epoche, ek: F-01(VKₑ, EK), inhalt: F-01(EK, json), autor, signatur }
signatur  = F-03(autor, "entry", tresor-ID, eintrags-ID, version, epoche, SHA-512/256(ek ‖ inhalt), zuletzt-gesehen)
```

- **Alle Felder in einem Geheimtext**: Titel, URLs, Benutzername, Passwort, TOTP, Notizen, eigene
  Felder, Tags, Favorit und frühere Passwörter. Unverschlüsselt sind nur IDs, Version, Epoche und
  Zeitpunkte. Kein Feld lässt sich einzeln tauschen oder lesen (E-11, E-14).
- **AAD** mit Tresor-ID, Eintrags-ID und Version (E-12, E-13).
- **Versionszähler**: Der Client merkt sich die höchste Version je Eintrag und lehnt kleinere ab
  (E-13).
- **Signatur des Autors**: Der Client prüft, dass der Autor zur angegebenen Epoche laut Log
  „bearbeiten“ durfte; so kann auch ein lesendes Mitglied, das VKₑ kennt, nichts unterschieben.
- **Löschen** ist ein signierter Grabstein mit neuer Version. Verschwindet ein bekannter Eintrag
  ohne Grabstein, warnt der Client (E-15).
- **Schlüssel**: EK und VKₑ entstehen nur im Client. Ein EK ist unter VKₑ verschlüsselt, den der
  Server nicht kennt; ein VKₑ gilt nur, wenn er zur signierten Bindung im Log passt
  ([P-06](#p-06-mitgliedschafts-log)). Einen eigenen Schlüssel kann der Server so nicht
  unterschieben (E-16).

Restrisiko: Einen neuen Eintrag, den ein Client nie gesehen hat, kann der Server diesem Client
vorenthalten.

**Wehrt ab:** E-11, E-12, E-13, E-14, E-15, E-16, E-17.

### P-10 Einzelnen Eintrag teilen

Der Teilende verpackt EK an das zertifizierte Bündel des Empfängers (F-02, Zweck `share`, Kontext
Tresor-ID, Eintrags-ID) und signiert die Freigabe mit Rolle und optionalem Ablauf. Der Empfänger
liest den Eintrag mit dem EK, nachdem er ihn gegen die Bindung `bindung(EK, "share", tresor-ID,
eintrags-ID)` in der signierten Freigabe geprüft hat. Widerrufen wechselt EK und verschlüsselt den
Eintrag neu.

**Wehrt ab:** E-05, E-12, E-16.

### P-11 Austritt und Schlüsselwechsel

1. Ein Verwalter signiert `entfernen` und `schlüsselwechsel` (Epoche e + 1) im Log.
2. Er erzeugt VKₑ₊₁ und verpackt es an die verbleibenden Mitglieder; die Bindung steht im
   signierten `schlüsselwechsel`.
3. Jeder Eintrag bekommt einen **neuen EK** unter VKₑ₊₁ und wird mit neuer Version neu
   verschlüsselt. Das ausgetretene Mitglied kennt die alten EK; mit ihnen liest es keine spätere
   Änderung, auch nicht das geänderte Passwort.
4. Passwörter, die das ausgetretene Mitglied lesen konnte, werden „Zum Ändern“ markiert; der
   Austritts-Bericht listet sie.

Der Server sperrt das Mitglied sofort; den Schlüsselwechsel macht der nächste Verwalter-Client.
Restrisiko: Bis dahin entscheidet der Server allein; was das Mitglied vor dem Austritt gelesen hat,
kennt es weiter, deshalb gelten diese Passwörter erst nach ihrer Änderung als sicher. Änderungen
nach dem Schlüsselwechsel liegen unter neuen EK.

**Wehrt ab:** E-26, E-16.

### P-12 Recovery-Kit

Ein Recovery Key (256 Bit) verschlüsselt AK (F-01, Weg `recovery`). Das Kit ist ein PDF zum
Ausdrucken mit Server-Adresse, Konto, Secret Key und Recovery Key (Crockford-Base32 mit
Prüfziffern) und QR-Code. Es wird auf dem Gerät erzeugt und nie hochgeladen. Wer das Kit nutzt,
legt danach einen neuen Recovery Key an.

**Wehrt ab:** E-01.

### P-13 Firmen-Recovery

- Standard für Firmen, pro Firma abschaltbar (Projektplan, Entscheidungen). Der Firmen-Recovery-
  Schlüssel ist ein X-Wing-Schlüsselpaar; der private Teil liegt an die Inhaber verpackt.
- Der Client verpackt AK an den Firmen-Recovery-Schlüssel (F-02) nur, wenn die Firmen-Richtlinie
  vom Wurzelschlüssel signiert ist, Firmen-Recovery dort an ist und der Schlüssel dem dort genannten
  Fingerabdruck entspricht. Er signiert die Hinterlegung mit seinem zertifizierten Ed25519-Schlüssel
  (F-03, Zweck `company-recovery`, mit `bindung(AK, "company", konto-ID)`).
- Bevor der Inhaber einen hinterlegten AK verwendet, prüft sein Client: Die Signatur stammt vom
  zertifizierten Bündel des Mitarbeiters, AK passt zur Bindung, AK entschlüsselt den Schlüsselblock
  des Mitarbeiters, und dessen Wurzel-Fingerabdruck und öffentliche Schlüssel stimmen mit dem
  eigenen Wurzelschlüssel und dem zertifizierten Bündel überein. Ein AK, den der Server selbst
  verpackt hat, besteht keine dieser Prüfungen.
- Wiederherstellen: Der Inhaber entschlüsselt AK, verpackt ihn an ein neues Gerät des Mitarbeiters
  ([P-04](#p-04-neues-gerat)) und signiert einen Audit-Eintrag; statt des eigenen Kontozustands
  trägt das Paket den Hash des Kontozustands des Mitarbeiters, den der Inhaber mit dessen AK
  entschlüsselt hat. Den Wurzelschlüssel liest das neue Gerät aus dem Schlüsselblock des
  Mitarbeiters. Der Mitarbeiter legt danach neue Entsperr-Wege an.

Ein Server, der eine Wiederherstellung mit eigenem Schlüssel unterschiebt, scheitert an der
fehlenden Signatur der Richtlinie.

**Wehrt ab:** E-01, E-02, E-10.

### P-14 Notfallzugriff

1. Der Gebende wählt eine Person mit zertifiziertem Bündel, Tresore und eine Wartezeit; sein Client
   verpackt die VKₑ dieser Tresore an sie (F-02, Zweck `emergency`) und signiert die Freigabe mit
   Wartezeit und den Bindungen der verpackten Schlüssel.
2. Fragt die Person an, benachrichtigt der Server den Gebenden; widerspricht er nicht innerhalb der
   Wartezeit, gibt der Server die Pakete heraus.
3. Die Person prüft Signatur und Zertifikat, entpackt und vergleicht jeden Schlüssel mit seiner
   Bindung. Nach einem Schlüsselwechsel erneuert der Client des Gebenden die Pakete.

Restrisiko: Die Wartezeit setzt der Server durch; ein bösartiger Server kann sie verkürzen, aber nur
zugunsten einer Person, die der Gebende selbst gewählt hat (E-04 ist damit auf die Wartezeit
begrenzt, nie auf eine fremde Person).

**Wehrt ab:** E-04, E-05.

### P-15 Was der Server sieht

| Sieht der Server | Sieht er nicht |
| --- | --- |
| Konten, Firmen, Geräte, Sitzungen, Anmeldezeiten, IP-Adressen | Passphrase, Secret Key, PRF-Ausgabe, AK, private Schlüssel |
| Tresor-IDs, Mitglieder, Rollen (im signierten Log) | Tresor-Namen und -Beschreibungen (verschlüsselt mit VKₑ) |
| Eintrags-IDs, Versionen, Größen, Zeitpunkte, Autor | Titel, URLs, Benutzernamen, Passwörter, TOTP, Notizen, Tags, Favoriten, Anhänge |
| öffentliche Schlüssel, Zertifikate, Fingerabdrücke | Recovery Key, Einladungsgeheimnis, Schlüssel von Einmal-Links |
| Audit-Ereignisse (wer, was, wann) | Inhalte der Ereignisse, die Einträge betreffen |

Die Größe der Geheimtexte verrät die ungefähre Länge eines Eintrags; Inhalte werden vor dem
Verschlüsseln auf ein Vielfaches von 256 Byte aufgefüllt.

**Wehrt ab:** E-14, E-24.

### P-16 Ausgelieferter Code

- **PWA**: Jede Version hat ein Release-Manifest (Datei → SHA-256), signiert mit dem
  Release-Schlüssel (Ed25519, F-03, Zweck `release`). Der Service Worker kennt den öffentlichen
  Schlüssel seit der Installation und aktiviert ein Update erst, wenn Signatur und alle Hashes
  stimmen. Der Loop signiert mit einem Test-Schlüssel; der echte kommt zur Veröffentlichung.
- **Extension**: Klartext-Oberfläche in der Extension, reproduzierbarer Build (K-408), Prüfung der
  Web-App durch die Extension.
- **Abhängigkeiten**: etwa sechs Laufzeitpakete auf einer Liste mit Begründung (K-102), exakt
  gepinnt, keine Install-Skripte.

Restrisiko: Die erste Installation der PWA und die PWA am Handy ohne Extension.

**Wehrt ab:** E-22, E-17.

### P-17 Ausfüllen

- Nur nach Klick oder Enter, nie beim Laden einer Seite.
- Nur bei exakt passendem Host (Public Suffix List über `tldts`); die URL kommt aus dem
  verschlüsselten Eintrag, nicht vom Server (E-14).
- Nie in einen Frame einer anderen Herkunft.
- Das Inline-Menü ist ein iFrame der Extension in einem geschlossenen Shadow DOM; die Seite kann es
  weder lesen noch unbemerkt überdecken (Clickjacking, DEF CON 2025).
- Am Handy kopiert Kennwort nur auf Tipp; die App leert die Zwischenablage nach 30 Sekunden und
  markiert sie als sensibel, die PWA kann das nicht zuverlässig.

**Wehrt ab:** E-14.

### P-18 Einmal-Links

Der Client erzeugt einen Schlüssel (256 Bit), verschlüsselt den Inhalt (F-01, Zweck `link`) und
legt den Schlüssel ins Fragment des Links. Der Server speichert nur den Geheimtext, den Ablauf und
die Zahl der Abrufe und löscht ihn danach. Restrisiko: Ablauf und Zahl der Abrufe setzt der Server
durch.

**Wehrt ab:** E-20.

### P-19 Import und Export

Der Import liest die Datei nur im Client und verschlüsselt jeden Eintrag nach
[P-09](#p-09-eintrage-speichern-und-lesen). Der eigene Export ist ein F-01-Geheimtext unter einem
Schlüssel aus einer Export-Passphrase (F-05-Parameter, eigenes Salt); exportieren dürfen nur
Verwalter, der Client signiert dafür einen Audit-Eintrag.

**Wehrt ab:** E-21.

### P-20 Audit-Log

Jedes Ereignis ist ein Glied einer Hash-Kette (`hash = SHA-512/256(enc("kennwort/audit/v1",
vorgänger-hash, ereignis))`); Ereignisse, die ein Client auslöst (Export, Recovery, Schlüsselwechsel),
signiert er. Clients merken sich den letzten Stand, der Export für Prüfer enthält die Kette, und die
Prüfung findet jede geänderte, fehlende oder eingeschobene Zeile.

**Wehrt ab:** E-23.

### P-21 Sync

Der Server speichert je Eintrag die Geheimtexte mit Version; Clients laden Änderungen per SSE und
schreiben mit der Version, von der sie ausgingen. Konflikte löst der Client: Beide Stände bleiben
erhalten, Felder werden zusammengeführt, bei Widerspruch gewinnt keiner stillschweigend. Eine
Warteschlange hält Änderungen, solange das Gerät offline ist. Jede Antwort des Servers wird nach
[P-06](#p-06-mitgliedschafts-log) und [P-09](#p-09-eintrage-speichern-und-lesen) geprüft, bevor sie
den lokalen Stand ändert.

**Wehrt ab:** E-13, E-15.

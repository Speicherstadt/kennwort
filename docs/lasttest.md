---
title: Lasttest
description: >-
  Wie viele Geräte ein Kennwort-Server mit Live-Sync trägt: der Lasttest mit hundert Geräten von
  Weber Haustechnik, seine Ziele, die Ergebnisse und wie man ihn selbst laufen lässt.
---

# Lasttest

Jedes geöffnete Gerät hält eine Verbindung zum Server offen (Server-Sent Events) und hört, sobald
jemand einen Eintrag in einem gemeinsamen Tresor ändert. Der Lasttest prüft, dass das auch mit
vielen Geräten zugleich schnell bleibt.

## Was er tut

1. Er startet den Server in einem eigenen Prozess auf Port 28750 mit einer frischen Datenbank und
   dem Tresor „Büro“ von Weber Haustechnik samt signiertem Mitglieder-Log (Jonas verwaltet, Anna
   bearbeitet, Max liest).
2. **Verbinden:** 100 Geräte, reihum von Jonas, Anna und Max, öffnen je einen Live-Stream auf
   „Büro“ und warten auf „ready“.
3. **Schreiben:** Die 67 Geräte von Jonas und Anna schreiben je fünfmal ihren eigenen Eintrag,
   jedes Mal nach einer zufälligen Pause bis zu einer Sekunde, verschlüsselt und signiert wie im
   Client.
4. **Mithören:** Jedes andere Gerät muss jede neue Version über seinen Stream hören. Gemessen wird
   die Zeit vom Beginn des Schreibens bis zur Ankunft auf jedem Gerät.
5. **Abgleichen:** Danach holt jedes Gerät den ganzen Tresor, prüft jede Signatur mit dem Sync aus
   `packages/core` und muss jeden Eintrag in seiner letzten Version lesen.

Gemessen werden die Dauer jedes Schreibens und Abrufs (p50, p95, p99), die Ankunftszeit bei den
anderen Geräten, der Speicher des Server-Prozesses (RSS) und jeder Fehler: ein Status außer 200 und
409, ein Stream, der nicht bereit wird, eine Änderung, die nicht ankommt, und ein Gerät, das am Ende
nicht alles liest.

Die Sitzungen sind feste Test-Token statt einer Anmeldung: Gemessen werden Sync und Live-Stream, nicht
Argon2id beim Anmelden. Sonst ist es dieselbe App wie im Betrieb, hinter `Bun.serve` wie in
`main.ts`.

## Ziele

| Messwert | Ziel |
| --- | --- |
| Schreiben p95 | unter 250 ms |
| Ankunft bei den anderen Geräten p95 | unter 500 ms |
| Ankunft bei den anderen Geräten p99 | unter 1 s |
| Speicher des Servers (RSS, Spitze) | unter 256 MiB |
| Fehler und verlorene Änderungen | keine |

Warum diese Werte, steht im [Projektplan](plan.md) unter „Entscheidungen“.

## Ergebnisse

Lauf vom 23. November 2026 auf einer Linux-Maschine mit vier Kernen, 100 Geräte, 335 Schreibvorgänge,
33 165 erwartete Ankünfte:

| Messwert | p50 | p95 | p99 | Höchstwert |
| --- | --- | --- | --- | --- |
| Schreiben | 4,7 ms | 13,3 ms | 21,5 ms | 27,9 ms |
| Ankunft bei den anderen Geräten | 5,2 ms | 14,1 ms | 21,3 ms | 29,7 ms |

- Alle 33 165 Änderungen kamen an, kein Fehler, jedes Gerät las am Ende alle 67 Einträge.
- 100 Streams waren nach 84 ms bereit.
- Speicher des Servers: 115 MiB nach dem Start, höchstens 132 MiB.
- Ein Abruf des ganzen Tresors braucht auf dem Server rund 13 ms. Die Zeit, die der Lasttest für das
  Abgleichen meldet (mehrere Sekunden), misst vor allem den Test selbst: Er prüft die Signaturen
  aller hundert Geräte in einem Prozess. Darum ist dafür kein Ziel gesetzt.

### Gefundener Engpass

Der erste Lauf verfehlte die Ziele: Jedes Schreiben las für jeden offenen Stream einzeln das
Mitglieder-Log des Tresors und schaute nach, ob die Person die Firma verlassen hat. Ein Schreiben
kostete so auf dem Server rund 2,7 ms plus 0,13 ms je offenem Stream, bei 100 Geräten 15,6 ms, und
weil der Server alles auf einem Thread erledigt, stauten sich die Anfragen (Ankunft p95 1,2 s bei
schnellen Schreibfolgen).

Jetzt ermittelt der Server beim Schreiben einmal, wer die Änderung hören darf (aktuelle Mitglieder
nach dem Log, die die Firma nicht verlassen haben), und jeder Stream prüft nur noch, ob er dazugehört.
Ein Schreiben kostet nun rund 2,5 ms, gleich ob ein Gerät zuhört oder hundert. Wer aus dem Tresor
entfernt wird oder die Firma verlässt, hört weiterhin nichts mehr; das prüfen die bisherigen Tests.

## Selbst laufen lassen

Im Repository, nach `bun install`:

```sh
cd apps/server
bun scripts/load.ts            # 100 Geräte, je 5 Schreibvorgänge
bun scripts/load.ts 300 10     # 300 Geräte, je 10 Schreibvorgänge
KENNWORT_LOAD_PORT=28760 bun scripts/load.ts   # anderer Port
```

Das Skript gibt die Messwerte als JSON aus und endet mit Code 1, wenn ein Ziel verfehlt ist. Der
Speicher wird unter Linux aus `/proc` gelesen.

Auf GitHub läuft der Test jede Nacht und von Hand unter **Actions → Lasttest → Run workflow** (mit
wählbarer Zahl der Geräte); das Ergebnis liegt dem Lauf als Datei bei. In jedem CI-Lauf prüft ein
kurzer Lauf mit zwölf Geräten in den Server-Tests, dass jede Änderung bei allen ankommt.

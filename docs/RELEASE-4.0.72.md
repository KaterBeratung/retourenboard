# retourenboard 4.0.72

Diese Version reduziert wiederholte Arbeit bei Übersetzungen, statischen Dateien und Nachrichten. Bestehende Arbeitsabläufe, Berechtigungen und Datenstrukturen bleiben erhalten.

## Verbesserungen

- Übersetzungen verwenden einen abgeleiteten Rückwärtsindex statt einer vollständigen Katalogsuche bei vielen Textfragmenten. Doppelte Übersetzungen und nachträglich ergänzte Kataloge behalten ihre bisherige Priorität.
- Statische Anwendungsdateien werden bei unterstützenden Clients mit Gzip übertragen. Ein auf 16 MiB und 128 Einträge begrenzter Dateicache bündelt parallele Lese- und Komprimierungsvorgänge und erkennt Dateiänderungen.
- Nachrichten prüfen mehrfach referenzierte Ziele nur einmal je Aufruf und entfernen ungültige Einträge gesammelt. Neue Anfragen berücksichtigen aktuelle Rechte erneut.
- Die lokale Designvorschau behandelt ihre ergänzten HTML-Inhalte mit korrekter Antwortlänge und Kodierung, auch für HEAD-Anfragen.

Anmeldung, beide Sitzungsprüfungen und private/no-store-Regeln bleiben erhalten. API-Antworten, CSRF-Daten, Anhänge und Produktbilder werden nicht zusätzlich gecacht oder komprimiert.

## Vergleichsmessungen

Isolierte synthetische Testumgebung mit Node.js 24.22.1. Übersetzungen und HTML-Erzeugung: Median aus sieben Runden.

| Last | Vorher | Nachher |
| --- | ---: | ---: |
| 5.000 Übersetzungsaufrufe | 301,72 ms | 0,85 ms |
| HTML für 200 Tabellenzeilen | 180,53 ms | 2,59 ms |
| Übertragene Bodies von zwölf JS-/CSS-Dateien | 524.793 Bytes | 158.177 Bytes |
| Datenbankabfragen für 300 Nachrichten zum selben Ziel | 314 | 15 |

Die Übertragung dieser Dateien sinkt um rund 70 %. Text- und HTML-Prüfsummen bleiben gleich. Die Zahlen beschreiben diese Testlast; sie sind keine pauschale Beschleunigung jedes realen Arbeitsablaufs. Erstmalige Komprimierung kostet CPU und war im Loopback-Test zunächst langsamer; bereits komprimierte Dateien werden wiederverwendet.

## Installation und Update

Node.js mindestens 24 und PostgreSQL 16–18. Vor einem Update Datenbank und Anhänge sichern. Den passenden Installer und die SHA256-Dateien aus den Release-Assets herunterladen:

```sh
sudo bash retourenboard-install-4.0.72.sh
```

Der Installer lädt das passende Programmpaket und prüft SHA256. Ein daneben abgelegtes Linuxpaket ist ebenfalls verwendbar. Bestehende Installationen können den In-App-Updater verwenden. Nach einem manuellen Austausch der Dateien muss der Anwendungsprozess neu gestartet werden, damit Backend und Versionsanzeige den neuen Stand übernehmen.

Weitere Hinweise: [Betrieb](BETRIEB.md), [Docker](../DOCKER.md).

## Prüfung und Grenzen

- Frische Abhängigkeitsinstallation, vollständiger Build und Tests unter Node.js 24.22.1.
- 1.472 Tests bestanden, null Fehler; drei Windows-Dateisymlink-/Linux-Fälle umgebungsbedingt übersprungen.
- Zusätzliche Prüfungen für Gzip-Aushandlung, HEAD, aktuelle Anmeldung nach Cachetreffern, Dateiänderungen, parallele Zugriffe, Cachegrenzen, Übersetzungsänderungen und aktuelle Nachrichtenrechte.
- Hauptansichten auf Desktop und schmalem Mobilgerät, Deutsch/Englisch und Hell/Dunkel kontrolliert.
- Installationsarchiv ohne Entwicklungsabhängigkeiten gestartet; Testmigration, Anmeldung, private Dateien, fortlaufende IDs und Entsorgungsnachweis geprüft.
- Öffentlicher Quellstand und Pakete enthalten keine privaten Konfigurationen, produktiven Daten, Sicherungen oder SMTP-Testschlüssel. Die Erzeugung eigener kurzlebiger Testzertifikate ist unter `tests/fixtures/README.md` beschrieben.

Keine vollständige neue Sicherheitsprüfung. Der Website-Build weist weiterhin auf erforderliche Betreiber-/Hostingangaben hin. In der synthetischen Vorschau besteht eine Warnung für einen künftigen pg-9-Wechsel; pg 8.23.1 bleibt festgelegt.

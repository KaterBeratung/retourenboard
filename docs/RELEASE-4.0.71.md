# retourenboard 4.0.71

## Änderungen seit 4.0.70

- Öffentlicher Kundenstatus für Retouren und Entsorgungsaufträge: individuelle Kurzlinks, begrenzte Laufzeit, Widerruf und ausdrücklich freigegebene Kommentarstände. Interne Inhalte bleiben geschützt. Die Freigabe wird in den jeweiligen Details verwaltet; siehe [Kundenstatus](customer-status.md).
- Klarer gegliederte Detailansichten und lange Formulare mit gemeinsamer Bereichsnavigation. Verbesserte Adminformulare, Meldungen, kompakte Menüs und schmale mobile Ansichten.
- Pflichtfeld- und Abschlussprüfung öffnen den betroffenen Formularbereich. Entwürfe bleiben beim Bereichswechsel erhalten.
- Einheitlichere Tabellen, Statusanzeigen, Checkboxen, SVG-Icons und Bewegungen; ruhigere Hover-Effekte und verbesserte Produkt-Auswahllisten.
- Nodemailer auf 10.2.1 aktualisiert. Drei Regressionstests prüfen die Empfängerauflösung für [verschachtelte Kommentare](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8), [Semikolons in Gruppenkommentaren](https://github.com/advisories/GHSA-m943-m63m-w62w) und [Anführungszeichen in Adressen](https://github.com/advisories/GHSA-85x2-q946-cp5h). Die vollständige Abhängigkeitsprüfung meldet keine bekannten Schwachstellen.
- Der Linux-Paketbau übernimmt die Projektlizenz jetzt direkt; ein Pakettest prüft deren vollständigen Inhalt.

## Installation und Update

Node.js mindestens 24, PostgreSQL 16–18. Vor einem Update eine Sicherung nach der [Betriebsanleitung](BETRIEB.md) erstellen. Der Installer und das kompilierte Programmpaket stehen im GitHub-Release zusammen mit SHA256-Dateien bereit. Bestehende Daten werden durch die vorhandenen additiven Migrationen übernommen.

```sh
sudo bash retourenboard-install-4.0.71.sh
```

Der kleine Installer ermittelt den aktuellen Release. Ein daneben abgelegtes versionsgleiches Programmpaket ermöglicht die lokale Installation. Bestehende Installationen können den vorhandenen In-App-Updater verwenden. Alle neun Assets umfassen versionierte und stabile Dateinamen sowie das Release-Manifest.

## Prüfung

- Node.js 24.22.1: frische Abhängigkeitsinstallation, TypeScript-/Anwendungs-/Website-Build und vollständige Tests auf dem bereinigten Veröffentlichungskandidaten.
- 1.461 Tests: 1.458 bestanden, 0 Fehler, drei unveränderte Windows-Dateisymlink-Auslassungen.
- Zusätzlich Archivinhalt/Prüfsummen, extrahierter Start ohne node_modules, SQLite-Migration mit unveränderter Quelldatei, Anmeldung, private Assets, Datenbank-Sequenzen und Entsorgungsnachweis geprüft.
- Hauptansichten in Dunkel/Deutsch und Hell/Englisch auf Desktop sowie bei 320 Pixel Breite geprüft. Kein gemessener horizontaler Seitenüberlauf; Browserkonsole ohne Warnungen/Fehler.
- Öffentliche Dateien und Installationsarchiv auf private Laufzeitdaten, Schlüssel, lokale Konfiguration und bekannte Tokenmuster geprüft. SMTP-Testschlüssel bleiben ausgeschlossen und werden für Tests lokal bereitgestellt.

## Grenzen

Kein vollständiges unabhängiges Sicherheitsaudit und kein Test an physischen iOS-Geräten. Reale SMTP-Zustellung, Scanner/Drucker und produktive OpenID-Anbieter wurden in diesem Release nicht neu geprüft. Die mitgelieferte Werbeseite benötigt vor Veröffentlichung weiterhin eigene Betreiber-/Hostingangaben in website/legal.json. Die lokale Demovorschau zeigt eine Vorwarnung zur zukünftigen pg9-Abfrageparallelität; verwendet wird die unveränderte pg8-Version. Produktive Daten und Konfiguration wurden durch die Prüfungen nicht verändert.

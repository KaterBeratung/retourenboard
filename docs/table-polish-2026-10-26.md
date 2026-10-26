# Tabellenangleichung und Feinschliff am 26.10.2026

Stand: Retourenboard 4.0.70.

## Ergebnis

Entsorgung verwendet jetzt dieselben Tabellen- und Kartenbausteine wie Retouren und Produkte. Gerät mit Avatar und Auftragskennung steht links, direkt danach der Status samt nächstem Schritt. Gerätekennung, Maßnahme und Erfassungsdatum folgen; die bestehenden Druck- und Detailaktionen stehen rechts. Datum und Uhrzeit verwenden die vorhandene Retourenformatierung.

Die vorhandene Tabellenansicht ist nun auch für Entsorgung verfügbar: Status, Gerätekennung, Maßnahme und Datum lassen sich ein-/ausblenden; Zeilendichte ist kompakt oder großzügig. Die Einstellungen bleiben pro Konto und Tabellenart getrennt. Bestehende Produkt- und Retoureneinstellungen werden nicht migriert oder umgeschrieben. Entsorgung wendet ihre Präferenzen nach jeder asynchronen Listenaktualisierung erneut an.

Mobil werden dieselben record-card-, record-top-, product-card-title- und record-actions-Bausteine verwendet. Artikelnummern stehen direkt beim Gerät. Die bisherige eigene Entsorgungstabelle, die sich mobil über positionale nth-child-Regeln in ein Raster verwandelte, entfällt. Bestehende Suche, serverseitige Filter/Paginierung, Details und Druckberechtigungen bleiben erhalten. Es wurden keine funktionslosen Sortierknöpfe ergänzt.

## Gemeinsame optische Anpassungen

- Tabellenkopf 44 statt 48 px; normale vertikale Zellabstände 12 statt 14 px. Die vorhandene kompakte Einstellung bleibt bei 10 px.
- Neue zentrale Tokens --table-head-surface und --table-row-hover: ruhiger Kopfbereich und neutraler Hoverzustand mit vorhandenen Themefarben.
- Klarere Geräteidentität mit dezenter Metazeile, einheitliche runde Kategorie-/Maßnahmenanzeigen und abgestimmte Schriftgrößen.
- Aktionsspalte bleibt am rechten Tabellenrand verankert. Auswahlzustände behalten ihren eigenen Farbton; Fokus- und Bewegungseinstellungen bleiben erhalten.

## Dateien

- public/theme.css: Tabellen-Tokens.
- frontend/src/app.ts: gemeinsame inventory-table-Klasse für Retouren/Produkte und die kompakte Übersichtstabelle.
- frontend/src/disposals.ts: gemeinsame Tabellen-/Kartenstruktur, Tabellenansicht, erneute Anwendung von Einstellungen nach Refresh, einheitliche Paginierung.
- frontend/src/table-preferences.ts: zusätzliche Tabellenart disposals, getrennte Speicherung und passender Hinweis zu Gerät/Aktionen.
- frontend/assets/design.css: gemeinsame responsive Sichtbarkeit, Aktionsausrichtung und Kopfoberfläche.
- frontend/assets/disposals.css: alte Entsorgungs-Zellen- und Mobilrasterregeln entfernt; nur fachliche Mindestbreiten bleiben.
- frontend/assets/workspace-refinements.css: gemeinsame Tabellenverfeinerung und kompakte Geräteunterzeile.
- tests/table-preferences.test.js und tests/disposal-ui.test.js: Konto-/Tabellenisolation, Schutz von Identität/Aktionen und sichere Desktop-/Mobilrepräsentation einschließlich Druckrechten.

## Abschlussprüfung

- Die drei neuen Regressionen schlugen vor der Umsetzung fehl und bestehen danach.
- Node.js 24.22.1: npm run build erfolgreich. Alle vier betroffenen CSS-Dateien mit esbuild ohne Parserwarnung geprüft.
- npm test mit isolierter PostgreSQL-Datenbank: 58 Tests erfolgreich, 0 Fehler. Geprüft wurden Tabellenpräferenzen, Entsorgungsoberfläche und -ablauf, Inventaranzeige, Retourenaktionen, mobile Tabellen, Retourenfilter, Menüs und Sortierung.
- Nach der letzten mobilen Anordnungskorrektur: 14 gezielte Präferenz-/UI-Tests erneut erfolgreich.
- Chromium-Vorschau mit synthetischen Daten: Entsorgung am Desktop (1440 px), bei 960 px sowie mobil bei 440 und 320 px; helle englische und dunkle deutsche Ansicht geprüft. Retouren und Produkte mit dem gemeinsamen Desktopstil gegengeprüft.
- Ausgeblendete Maßnahme und kompakte Dichte bleiben nach Filterwechsel und Seitenneuladung erhalten; anschließend die lokalen Demo-Einstellungen wieder auf Standard zurückgestellt.
- Kein horizontaler Überlauf der mobilen Karten: 271 px Kartenbereich bei 320-px-Viewport, 627 px bei 960-px-Viewport. Gerätekennung, Maßnahme, Status und Aktionen bleiben erreichbar.
- Neuer mobiler Detailknopf öffnet den bestehenden Auftrag. Druckrechte und sichere Textausgabe sind in beiden Repräsentationen getestet. Keine Geschäftsdatensätze verändert.

Ein echter iPhone-/Safari-Test und ein Deployment der öffentlichen Demo wurden nicht durchgeführt. Die Vorschauprüfung erfolgte lokal; es wurden weder zusätzliche Frameworks noch Datenbankänderungen eingeführt.

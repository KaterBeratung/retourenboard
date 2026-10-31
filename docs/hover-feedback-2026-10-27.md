# Einheitliche Hover-Rückmeldung · 27.10.2026

## Ergebnis

Bedienbare Elemente verwenden dezente Glasflächen, Rahmen- und Farbwechsel. Die neuen Zustände ändern weder Abmessungen noch Positionen. Vorhandene Statusfarben, SVG-Animationen, Fokusmarkierungen, Berechtigungen und Aktionen bleiben erhalten. Neue Hover-Regeln gelten nur für Geräte mit Hover-Unterstützung und präzisem Zeiger; auf kleinen Bildschirmen bleiben die bestehenden Touchflächen erhalten. Reduzierte Bewegung deaktiviert weiterhin Übergänge.

## Geänderte Quellen

- `frontend/assets/design.css`: Kontobutton, aktive Navigation, Bereichswechsel, mobile Navigation, einfache Inhaltslinks, Suchfelder und allgemeine Aufklappmenüs. Gemeinsame Buttons berücksichtigen deaktivierte Zustände.
- `frontend/assets/workspace-tools.css`: gespeicherte Ansichten, Schnellfilter, Speichern und Entfernen. Entfernen behält die rote Aktionsfarbe.
- `frontend/assets/workspace-refinements.css`: ausgewählte Tabellendichte; überschreibenden Toolbar-Hintergrund entfernt, der Menü-Hover verdeckte.
- `frontend/assets/chat.css`: erkennbare Rückmeldung für aktive und andere Unterhaltungen, angeheftete Vorschauen und Bildanhänge.
- `frontend/assets/settings.css`: Bestätigungsfelder und Sprachwahl; Feld-Hover auf Zeigergeräte begrenzt.
- `frontend/assets/switches.css`: zurückhaltender innerer Hover statt zusätzlichem äußeren Halo.
- `public/styles.css`: Checkboxen reagieren auch auf Hover über ihre Beschriftung; ausgewählte und teilweise ausgewählte Zustände behalten ihr Symbol.
- `frontend/assets/workspace-insights.css`: Fußlinks der Aufgabenübersicht.
- `frontend/assets/motion.css`: gemeinsame Farb-, Rahmen-, Schatten- und Bildübergänge; vorhandene Einstellung für reduzierte Bewegung bleibt maßgeblich.
- `frontend/src/scan-labels.ts`: die beiden bisher ungestalteten Kamera-Schaltflächen verwenden die vorhandene Klasse `secondary`.

Keine neuen Farb-Tokens. Verwendet werden `--menu-hover`, `--surface-hover`, `--line-strong`, `--accent-hover`, vorhandene Statusfarben und `--motion-fast`. Die doppelte frühere Secondary-Hover-Regel wurde entfernt.

## Abschlussprüfung

- `npm run build` mit Node.js 24.22.1: erfolgreich.
- Alle 18 CSS-Dateien mit esbuild geparst: keine Warnungen.
- Bestehende Tests für Icon-System und -Animationen, Übersicht, Aktionsmenüs, Schnellmenü, Darstellung, Scanner, Chat-Suche, Chat-Anhänge und Composer-Tastaturbedienung: 92 bestanden, keine Fehler oder übersprungenen Tests.
- CSS-Regelabdeckung der sichtbaren Bedienelemente auf Übersicht, Retouren, Produkten, Entsorgung, Scan-Erfassung, Stammdaten, Daten & Werkzeugen, Servereinstellungen, Konto und Chat kontrolliert. Reine Datenanzeigen und der nur per Tastatur sichtbare Sprunglink benötigen keinen Hover-Effekt.
- Echte Hover-Zustände stichprobenartig im Browser geprüft: Menüeinträge, Kontobutton, Aufklappmenü, deaktivierter Primärbutton und ausgewählte Unterhaltung. Beim Menüeintrag und der Unterhaltung blieben die gemessenen Rechtecke unverändert.
- Tastaturfokus am Schnellfilter sichtbar (2 px); keine Aktion nur durch Fokus ausgelöst.
- Responsive Prüfung bei 320 × 640, hell/englisch und dunkel/deutsch: kein horizontaler Seitenüberlauf. Schnellmenü und gespeicherte Ansichten bleiben im sichtbaren Bereich; mobile Menüzeilen 44 px. Retourendialog und Chat ohne überstehende Bedienelemente.
- Abschließende Browserkonsole: keine Warnungen oder Fehler.

Die Prüfung kombiniert Quellcode, CSS-Regelabdeckung und konkrete Browserstichproben. Es wurde kein physisches iPhone und nicht jede Berechtigungs-/Datenkombination geprüft. Es wurden keine Retouren, Nachrichten, Stammdaten oder Servereinstellungen gespeichert. Sprache und Farbschema sind wieder Deutsch/Dunkel; die temporäre Browsergröße ist zurückgesetzt. Version 4.0.70 unverändert; keine Veröffentlichung oder Releasepakete erstellt.

## Nachkontrolle: Menü-Icon und Stammdaten-Hover

- Schließen-SVGs in den gemeinsamen Menüköpfen waren bei 30-px-Buttons durch 7 px Innenpadding plus Rahmen und 18-px-Icon um jeweils 2 px nach rechts und unten verschoben. Die doppelte Größenregel in `workspace-refinements.css` wurde mit der Schnellmenü-Regel in `design.css` zusammengeführt. Gemeinsame Grid-Zentrierung mit 0 px Padding: gemessener Versatz horizontal/vertikal jetzt jeweils 0 px, sowohl bei 30 px auf Desktop als auch bei 44 px mobil.
- Die Hover-Regel der Stammdaten-Karten entfernte per `background`-Kurzschreibweise das Glas-Hintergrundbild sofort. Gleichzeitig begann erst der Farbübergang von transparent zur Ersatzfarbe. Die Regel ändert jetzt nur `background-color`; der Verlauf bleibt auch beim wiederholten Wechsel zwischen Hersteller/Kategorien erhalten. Bei ausgewählten Karten bleibt die grüne Statusfläche erhalten. Abmessungen und Position unverändert, keine Bewegung der Klickflächen.
- Frisch geprüft: Build mit Node.js 24 erfolgreich; 18 CSS-Dateien ohne Parserwarnung; 11 bestehende Menü-/Icon-Animationstests bestanden. Desktop dunkel/DE und hell/EN, mobiles Menü bei 320 × 640: SVG zentriert, kein horizontaler Seitenüberlauf, Menü innerhalb des Viewports. Browserkonsole ohne Fehler/Warnungen. Darstellungspräferenzen und temporäre Bildschirmgröße wiederhergestellt.

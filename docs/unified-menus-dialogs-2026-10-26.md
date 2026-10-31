# Einheitliche Menüs und Dialoge – 26.10.2026

## Ergebnis
Die vorhandenen Menüs und Dialoge übernehmen die Materialien und Abstände des freigegebenen Übersichtseditors. Änderungen betreffen ausschließlich CSS-Quelldateien. Dialogfunktionen, Formulare, native Auswahlfelder, Berechtigungen und gespeicherte Ansichten bleiben unverändert.

## Geänderte Dateien und Bereiche
- `frontend/assets/design.css`: gemeinsame Dialogköpfe, schrumpfbare Formular-/Detailraster, scrollbar begrenzte Inhalte, gleich hohe umbrochene Footerbuttons und zweispaltige mobile Aktionsleisten; Schnellmenügruppen.
- `frontend/assets/workspace-refinements.css`: kompakte gruppierte Tabellenoptionen, begrenzte mobile Menühöhe mit Platz für die untere Navigation.
- `frontend/assets/inventory-polish.css`: einzelne Auswahlzeilen und exakt ausgerichtete native Switch-Eingabeflächen.
- `frontend/assets/workspace-tools.css`: gespeicherte Ansichten und Schnellfilter mit gemeinsamen Gruppenflächen.
- `frontend/assets/settings.css`: Bestätigungen und Berechtigungsgruppen, weniger doppelte Nachrichten-Dialogregeln.
- `frontend/assets/chat.css`: Mitgliederauswahl mit klarer ausgewählter Fläche und Textumbruch.
- `frontend/assets/scan-labels.css`: gemeinsamer Dialograhmen und Backdrop, intern scrollbarer Inhalt, passende Scan-/Auswahlflächen.
- `frontend/assets/return-labels.css`: vereinheitlichter Vorschaukopf und runder Schließen-Button. Weiße Druckflächen und vorhandene Papier-Scrollfunktion erhalten.

## Zentrale Gestaltung
Keine zusätzliche Palette oder überschreibende Theme-Datei eingeführt. Wiederverwendet werden `--surface`, `--control-surface`, `--segment-surface`, `--segment-selected`, `--field-radius`, `--dialog-padding`, `--dialog-radius`, `--menu-*`, `--line`, `--accent-background`, `--accent-line` und vorhandene Schatten-/Bewegungstokens.

Doppelte Header-/Body-/Footerregeln des Nachrichtendialogs sowie ein doppelter mobiler Header-/Formpaddingblock entfernt. Abweichende feste Radien, Scan-Backdrops und teilweise doppelte Berechtigungsgruppen-Flächen durch gemeinsame Tokens ersetzt. Formular- und Detailspalten verwenden `minmax(0,1fr)`.

## Abschlussprüfung
- Node.js 24.22.1: `npm run build` erfolgreich, zuletzt nach der finalen CSS-Anpassung.
- `npm test`: 1.374 Tests, davon 1.371 bestanden, 0 fehlgeschlagen, 3 übersprungen.
- Nach den abschließenden CSS-Korrekturen: 24 gezielte Regressionstests für Tabellenoptionen, Workflowdialoge, Selects, Chatpanels und Übersichtspersonalisierung erneut bestanden.
- Unabhängige Codeprüfung aller acht CSS-Diffs. Gefundenes Überlappen eines langen mobilen Menüs mit der unteren Navigation behoben und im Browser nachgemessen: bei 320 × 640 endet das Menü bei y=540, Navigation beginnt bei y=560. Letzter Menüpunkt per Tastatur erreichbar.
- Schalter-Eingabefläche im Berechtigungsdialog nachgemessen: sichtbarer Schalter und unsichtbares natives Eingabefeld haben identische Grenzen.
- Browserkonsole zum Prüfzeitpunkt ohne Warnungen/Fehler.

### Visuelle Stichproben in der isolierten lokalen Demo
| Darstellung | Geprüfte Ansichten |
| --- | --- |
| Dunkel / DE, 440 × 956 | Tabellenansicht, gespeicherte Ansichten, Schnellmenü, neue Retoure, Stammdatenformular, Entsorgungsdetails |
| Dunkel / DE, 320 × 640 | Produktformular, Produktaktionen, Berechtigungen, Scan, Retourendetails, Etikettenvorschau, Nachrichten |
| Hell / EN, 320 × 640 | Statusdialog, geöffnetes Select-Menü, Tabellenansicht bis zum letzten Eintrag |
| Hell / EN, 440 × 956 | Chat-Gruppendialog mit ausgewähltem Mitglied; anschließend ohne Speichern geschlossen |
| Dunkel / DE, 1440 × 1000 | Berechtigungen, Entsorgungsdetails und Nachrichten |
| Dunkel / DE, 844 × 390 | Neue Retoure und Entsorgungsdetails: Inhalt scrollbar, Aktionsleiste sichtbar |

In den geprüften Kombinationen keine seitlichen Dialogüberstände oder überlappenden Bedienelemente gefunden. Öffnen, Auswahl, Tastaturfokus, Escape/Schließen und interne Scrollflächen geprüft. Alle Dialoge ohne Daten- oder Rechteänderung geschlossen; Designsprache und Farbschema nach der Prüfung auf Deutsch/Dunkel zurückgestellt.

## Grenzen
Browserprüfung mit simulierten Bildschirmgrößen; kein physischer iPhone-/Safari-Test. Die Stichproben decken gemeinsame Dialogvarianten und zentrale Menüs ab, nicht jede mögliche Daten-/Berechtigungskombination. Keine neue vollständige Sicherheitsprüfung durchgeführt. Bestehende Webseiten-Buildmeldung zu noch auszufüllenden Betreiber-/Hostingangaben bleibt unverändert und betrifft diese UI-Anpassung nicht.

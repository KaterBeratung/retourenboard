# Stabile Hover-Flächen · 27.10.2026

## Ursache und Korrektur

Bei mehreren Glasbuttons entfernte die Hover-Regel per `background`-Kurzschreibweise das vorhandene Hintergrundbild sofort. Die Ersatzfarbe wurde dagegen erst eingeblendet. Dadurch konnte vorübergehend der Hintergrund durchscheinen. Vor der Korrektur im Browser an einem normalen Scanbutton bestätigt: Verlauf im Ruhezustand, `background-image: none` beim Hover.

50 vorhandene Hover-Deklarationen verwenden jetzt ausschließlich `background-color`. Die Farbwerte und Selektoren bleiben erhalten, das Glas- oder Glanzbild wird durchgängig gezeichnet. Zugehörige Öffnungszustände des Schnell-/Währungsmenüs, gespeicherter Ansichten, allgemeiner Aufklappmenüs und der Chatsuche folgen demselben Prinzip. Keine zusätzlichen überschreibenden Theme-Blöcke, keine neuen Abhängigkeiten oder Layoutregeln.

Damit erfasst sind gemeinsame Buttons, Navigation, Suchauslöser, Tabellen- und Aktionsmenüs, Scan-Erfassung, Scanner, Etikettenvorschauen, Dialoge, Datei-/Importflächen und Chat. KPI-Karten waren bereits korrekt; ihre Rahmen-/Schatteneffekte bleiben erhalten. Die vorhandenen Icon-Animationen und das Klickfeedback werden beibehalten. Hover-Regeln enthalten weiterhin keine Bewegung der Klickflächen und ändern keinen Backdrop-Filter.

## Geänderte Quelldateien

- `frontend/assets/chat.css`
- `frontend/assets/design.css`
- `frontend/assets/inventory-polish.css`
- `frontend/assets/return-labels.css`
- `frontend/assets/scan-intake.css`
- `frontend/assets/scan-labels.css`
- `frontend/assets/settings.css`
- `frontend/assets/workflow.css`
- `frontend/assets/workspace-personalization.css`
- `frontend/assets/workspace-refinements.css`
- `frontend/assets/workspace-tools.css`
- `public/styles.css`

## Abschlussprüfung

- `npm run build` mit Node.js 24: erfolgreich.
- Alle 18 CSS-Dateien mit esbuild geparst: 0 Warnungen.
- Änderungen gegen die lokalen Ausgangskopien kontrolliert: ausschließlich Hintergrundfarben statt Hintergrund-Kurzschreibweisen plus ein erläuternder Kommentar; keine Layout-/Funktionsänderungen.
- Vollständiges `npm test`: 1.386 Tests, 1.383 bestanden, 3 übersprungen, 0 Fehler. Laufzeit rund 165 Sekunden. Vollständiges Protokoll: `.qa/hover-surfaces470/tests.log`.
- 38 konkrete Browser-Hoverprüfungen: Verläufe, Abmessungen, Transformationen und Backdrop-Filter in allen Messungen unverändert.
- Geprüfte Bereiche: Übersicht und KPI-Karten, gemeinsame Primär-/Sekundär-/Gefahrenbuttons, Suche, Schnellmenü/Währung, Übersicht-anpassen-Dialog, Tabellenansicht, gespeicherte Ansichten, Retourendetails, Etiketten-Druckvorschau, Scan-Erfassung/Scandialog, Retourenregeln und Chat.
- Desktop Dunkel/Deutsch und Hell/Englisch; Menüprüfung bei 320 × 640: kein horizontaler Seitenüberlauf, 44-px-Menübuttons, Popup im sichtbaren Bereich.
- Risikoabgleich der geladenen Hover-Regeln: keine verbliebene Hover-Kurzschreibweise, die einen Glasverlauf entfernt. Abschließende Browserkonsole ohne Warnungen/Fehler.

Die Hoverprüfung nutzt normale Zeigerereignisse ohne Aktivierung der jeweiligen Aktion. Es wurden keine Retouren/Regeln gespeichert, keine Nachrichten gesendet, keine Dateien ausgewählt, keine Kamera gestartet und kein Druck ausgelöst. Der Hinweis bei der Scan-Erfassung ohne ausgewähltes Produkt war eine erwartete Schutzfunktion; der Scandialog wurde anschließend über den allgemeinen Scanner geöffnet.

Die Prüfung kombiniert Quellcodeanalyse, tatsächliche Browserzustände und die bestehende Testsuite. Ein physisches iPhone und jede denkbare Daten-/Berechtigungskombination wurden nicht geprüft. Sprache und Farbschema sind wieder Deutsch/Dunkel, die temporäre Bildschirmgröße ist zurückgesetzt. Version 4.0.70, Releases, GitHub und Backups unverändert.

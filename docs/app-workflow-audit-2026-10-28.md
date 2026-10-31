# Ablauf- und Oberflächenprüfung — 28.10.2026

Stand: Retourenboard 4.0.70, aktiver Arbeitsordner `D:\retourenboard`. Umsetzung nach direkter Freigabe des Ablaufs. Bestehende, nicht zu dieser Aufgabe gehörende Änderungen wurden erhalten.

## Neuer Ablauf

- **Retoure speichern** öffnet nach bestätigter normaler Neuanlage die gespeicherten Details. Ein neuerer Entwurf, ein anderer Dialog oder ein zwischenzeitlicher Routenwechsel wird dabei nicht verdrängt.
- **Speichern & weitere Retoure** behält die schnelle Mehrfacherfassung bei.
- Die Details zeigen unter Gerät und Zeitangaben einen kompakten Bearbeitungsstand: tatsächlicher nächster Schritt, zuständige Person und vorhandene erlaubte Anschlussaktion. Ohne eigenen nächsten Schritt wird eine Orientierung passend zum bekannten Status angezeigt; unbekannte Status bleiben neutral.
- Abgeschlossene Retouren zeigen den Abschluss und verwenden die bestehenden Wiederöffnungsregeln. Ein alter nächster Schritt wird nicht als aktuelle Aufgabe ausgegeben.
- **Verlauf ansehen** springt zur tatsächlichen Historie. Diese steht vor dem gemeinsamen Bereich **Kommentare & Kundenstatus**.
- Zusammengehörige Status-, Zuständigkeits- und Aufgabenänderungen werden anhand derselben Audit-ID und desselben Zeitpunkts in einer Karte gezeigt. Unabhängige Kommentare, Anhänge und andere Vorgänge bleiben eigene Ereignisse; die API-Reihenfolge bleibt neueste zuerst.

## Behobene Fehler

1. Nach erfolgreichem Speichern führte eine fehlgeschlagene Bestandsabfrage zu einer irreführenden Fehlermeldung bzw. veralteten Details. Der bestätigte Speichervorgang wird jetzt getrennt vom Nachladefehler behandelt; bestätigte Datensätze bleiben nutzbar.
2. Nachladende Formulare, Übergaben und Wiederöffnungen konnten neuere Dialoge oder andere Routen überlagern. Fortsetzungen prüfen jetzt Dialog, Entwurf, Route, Authentifizierung und vorhandene Berechtigungen.
3. Eine während einer laufenden Verlaufsabfrage angeforderte Aktualisierung wurde verworfen. Sie wird nun direkt anschließend nachgeholt.
4. Wiederholtes Öffnen des gemeinsamen Detaildialogs konnte alte Verlaufslistener behalten. Pro Dialog wird die vorherige Bindung ersetzt.
5. Aktualisierungen ersetzten auch unveränderte Historie und verloren aufgeklappte Texte bzw. Fokus. Unveränderte Inhalte bleiben bestehen; geänderte Ansichten erhalten Expansion und passenden Fokus.
6. Kurze mehrzeilige Verlaufstexte konnten abgeschnitten werden, obwohl die bisherige Zeichenzahlgrenze keinen Aufklappknopf auslöste. Jetzt entscheidet der tatsächliche sichtbare Überlauf; Größenänderungen werden berücksichtigt.
7. Die Übergabe bezeichnete die erforderliche Zuständigkeit als optional. Der Hilfetext berücksichtigt nun das echte Pflichtfeld.
8. Die Scan-Erfassung sortierte Status anders als das einzelne Retourenformular. Beide verwenden jetzt dieselbe vorhandene Prozessreihenfolge; ausdrücklich gesetzte Standards bleiben erhalten.
9. Die mobile Suchlupe verlor durch die ausgeblendete Textbeschriftung ihren zugänglichen Namen. Sie besitzt nun ein mit DE/EN wechselndes `aria-label`.

## Gestaltung und erhaltene Funktionen

Bestehende Farb-, Radius-, Abstands- und Erfolgstokens werden wiederverwendet. Keine neue Palette oder weitere Theme-Schicht. Vorhandene Timeline-Regeln wurden direkt angepasst: kompaktere Abstände, kreisförmige Ereignissymbole und kontrollierter dreizeiliger Text. Die Ergänzungen betreffen nur den Bearbeitungsstand und gruppierte Änderungen. Auf kleinen Bildschirmen ordnen sich Aktionen unter dem Text an; die primäre Aktion erhält mindestens 44 px Höhe.

Bestehende Statusdefinitionen, Rechte, Datenbankschemata, Kundenfreigaben, Anhänge, Tabellenpräferenzen, Footeraktionen und Arbeitsabläufe bleiben erhalten. Die primäre Anschlussaktion verwendet die bereits berechtigungsgeprüfte Detailaktion. In dieser Aufgabe wurden keine Backenddateien geändert.

## Geänderte Dateien dieser Aufgabe

| Datei | Zweck |
| --- | --- |
| `frontend/src/forms.ts` | Sichere Speicherfortsetzung, bestätigte Details, Guidance-Aktionen und Reihenfolge |
| `frontend/src/inventory-display.ts` | Bearbeitungsstand mit echten Aufgaben, Zuständigkeit und DE/EN |
| `frontend/src/return-transitions.ts` | Schutz neuerer Ansichten bei Übergabe/Wiederöffnung |
| `frontend/src/return-timeline.ts` | Gruppierung, Refresh-Warteschlange, Fokus, Expansion und Listener-Lebenszyklus |
| `frontend/src/form-feedback.ts` | Richtiger Pflichtfeldhinweis bei Übergabe |
| `frontend/src/scan-intake.ts` | Einheitliche Statusreihenfolge |
| `frontend/src/app.ts` | Zugängliche mobile Suche |
| `frontend/assets/workflow.css` | Kompakter Verlauf und responsive Bearbeitungsübersicht |
| `tests/quality-forms.test.js` | Speicherfortsetzungen, Fehler- und Ansichtswechselrennen |
| `tests/return-timeline-ui.test.js` | Aktualisierung, Gruppierung, Expansion, wiederverwendete Dialoge |
| `tests/return-guidance.test.js` | Neue reine Renderer-Regressionstests |
| `tests/form-feedback.test.js` | Erforderliche Zuständigkeit korrekt erklärt |
| `tests/scan-intake.test.js` | Statusreihenfolge entsprechend Einzelretoure |

Zusätzlich: diese Dokumentation sowie Spezifikation und Umsetzungsplan unter `docs/superpowers/`. Build-Ausgaben wurden aus den Quellen neu erzeugt, nicht als alleinige Änderung bearbeitet.

## Abschlussprüfung

- Node.js **24.22.1**.
- `npm run build`: erfolgreich, einschließlich TypeScript-Oberfläche und Server-/Bibliotheksbundles.
- `npm test`: **1.446 Tests, 1.443 bestanden, 0 fehlgeschlagen, 3 übersprungen**, Dauer 168,65 s.
- Die drei übersprungenen Fälle benötigen unter Windows nicht verfügbare Dateisymlink-Rechte: zwei Linux-Installer-Szenarien und ein Anhang-Dateisymlink-Szenario. Verzeichnis-Junction-Abdeckung bleibt aktiv.
- Neue Verhaltensregressionen wurden vor dem Fix fehlschlagend und anschließend erfolgreich ausgeführt.
- Unabhängiges Schlussreview: drei konkrete Fehler reproduziert, behoben und erneut geprüft; auch die beiden abschließenden Scan-/Suchlabel-Ergänzungen ohne weitere konkrete Regression.
- Bestehendes `npm run preview` auf `127.0.0.1:3022`, ausschließlich synthetisches Demokonto.
- Hauptansichten überprüft: Übersicht, Retouren, Produkte, Entsorgung, Scan-Erfassung, Chat und Admin. Desktop 1440 × 900 sowie schmale mobile Ansicht 320 × 852; dunkle deutsche und helle englische Ansichten einschließlich Sprach-/Themewechsel.
- In den gemessenen Hauptansichten kein horizontaler Seitenüberlauf. Retourendetail und Editor bei 320 px: Dialog 279/279 px und Inhalt 269/269 px sichtbare/Scrollbreite. Datumsfeld 237 × 44 px.
- Echte Bedienprüfung im lokalen Demo: Retoure angelegt → gespeicherte Details → Übergabe mit Status/Zuständigkeit/nächstem Schritt → gruppierter Verlauf; globale Suche, Anschlussaktion zum Editor und abgeschlossene Retoure ebenfalls geprüft. Es wurden keine öffentlichen Kundenlinks erzeugt.
- Der synthetische Nachweisdatensatz `RET-2026-000011`, Seriennummer `QA-WORKFLOW-1028-001`, bleibt zur Ansicht erhalten.

Screenshots und Messdaten liegen lokal im Ordner:
`C:\Users\Alex\.codex\visualizations\2026\10\05\01a10b8a-04dc-77c0-8111-4c536d046e6d\app-workflow-audit-1028`.
Test- und Buildprotokolle: `.qa/app-workflow-audit-2026-10-28/`.

## Grenzen und offene Hinweise

Keine neuen ungelösten Fehler im überprüften Ablauf bekannt. Ein physisches iPhone/Safari, reale Scanner/Drucker, produktive OAuth-Anbieter und externe Kundenzugriffe wurden in dieser Prüfung nicht durchgetestet. Die Prüfung ist keine vollständige Sicherheitszertifizierung und keine Garantie, dass sämtliche Kombinationen von Daten und Berechtigungen fehlerfrei sind.

Der Build meldet weiterhin den vorhandenen Hinweis auf unvollständige Betreiber-/Hostingangaben in `website/legal.json`; diese Angaben müssen vom Betreiber ergänzt werden. Die bestehende PostgreSQL-Vorschauwarnung zur parallelen Abfrage desselben Clients wurde durch diese Frontendänderungen nicht bearbeitet.

Keine Versionsänderung, kein Commit/Push, kein Release und keine Veröffentlichung im Rahmen dieser Aufgabe.

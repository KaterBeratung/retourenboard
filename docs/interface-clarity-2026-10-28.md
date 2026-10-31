# Übersichtlichere Oberfläche — 28.10.2026

Umgesetzt im aktiven Projekt `D:\retourenboard`, Stand 4.0.70. Folgeauftrag: Retourenboard insgesamt klarer ordnen. Gestalterische Details entsprechend der direkten Freigabe selbst entschieden.

## Sichtbare Änderungen

- **Retourendetails:** sichtbare Reiter für Übersicht, Verlauf, Kommentare & Kundenstatus und Dateianhänge. Zuvor standen alle Bereiche in einem einzigen sehr langen Fenster. Übersicht enthält weiterhin Gerät, Seriennummer, Zeitangaben, nächsten Schritt, Zuordnung, Prüfung und verknüpfte Entsorgung.
- **Entsorgungsdetails:** dieselbe Navigation für Übersicht, Verlauf sowie Kommentare & Kundenstatus. Keine leere Dateienfunktion ergänzt.
- Kommentare und Kundenfreigabe bleiben zusammen. Nur der gewählte Bereich ist sichtbar; sämtliche Formularknoten bleiben erhalten. Ein Reiterwechsel veröffentlicht nichts und verwirft keinen Entwurf.
- „Verlauf ansehen“ wechselt direkt zum richtigen Reiter. Der interne Admin-Änderungsverlauf liegt beim Ereignisverlauf.
- Fensterhöhe bleibt beim Bereichswechsel gleich. Im Browser sprang das Fenster vorher beim Wechsel von Übersicht zu Dateien von 852 auf 537 px Höhe; die neue gemeinsame Höhenregel verhindert diesen Positionswechsel.
- **Retouren- und Entsorgungslisten:** Statusauswahl und Suche bilden jetzt einen gemeinsamen Tabellenkopf. Ansichtsmenüs bleiben außerhalb des begrenzenden Tabellenpanels, damit sie vollständig aufgehen.
- Ruhigere gemeinsame Seitenüberschriften, kompaktere Informationsabstände in Details und etwas kompaktere Arbeitskarten auf der Übersicht. Bestehende Oberflächen-, Akzent-, Radius- und Bewegungstokens wiederverwendet; kein weiteres Theme darübergelegt.
- Mobile Reiter umbrechen in zwei Spalten und behalten mindestens 44 px Bedienhöhe. Die feste Reiterleiste erhält einen deckenden Hintergrund, damit gescrollte Aktionen und Texte nicht durchscheinen.

## Erhalten

Bestehende Aktionen und Berechtigungen, Formulare, Statusdefinitionen, Reihenfolge/Filterung der Daten, Kommentar- und Freigabelogik, Anhänge, Tabellenkonfiguration und Übersichtsanpassungen bleiben erhalten. Tabwechsel ändern nur Sichtbarkeit, ARIA-Auswahl, Tastaturfokus und Scrollposition. Es wurden weder Backend noch Datenbankschema oder Rechte geändert.

## Geänderte Quellen und Tests

| Datei | Änderung |
| --- | --- |
| `frontend/src/ui.ts` | Gemeinsame Detailbereiche mit ARIA und Tastatursteuerung |
| `frontend/src/inventory-display.ts` | Retoureninhalte in klar getrennte Bereiche aufgeteilt |
| `frontend/src/forms.ts` | Inhalte an passende Hosts binden; Verlauf-Verknüpfung |
| `frontend/src/disposals.ts` | Gleiche Detailnavigation und gemeinsamer Listenaufbau |
| `frontend/src/app.ts` | Statusauswahl innerhalb des Listenpanels |
| `frontend/assets/workspace-refinements.css` | Reiter, stabile Fensterhöhe, einheitlicher Tabellenkopf und Überschriften |
| `frontend/assets/design.css` | Bestehende Detailabstände direkt angepasst |
| `frontend/assets/workspace-insights.css` | Kompaktere Übersichtskarten und Abschnittsabstände |
| `tests/detail-sections.test.js` | Neue Auswahl-, Tastatur-, ARIA- und Entwurfserhaltungsfälle |
| `tests/quality-forms.test.js` | DOM-Grenzen auf die neuen Hosts angepasst; bestehende Entwurfsschutzfälle erhalten |
| `tests/return-filter-counts.test.js` | Statuszähler aus gerenderten Daten lesen, unabhängig davon, ob die Statuszeile vor oder im Panel liegt |

Plan und Entwurfsentscheidungen: `docs/superpowers/plans/2026-10-28-interface-clarity.md` und zugehörige Spezifikation unter `docs/superpowers/specs/`.

## Prüfung

- Node.js 24.22.1, vorhandene Abhängigkeiten.
- Neue Verhaltenstests zuerst fehlgeschlagen, nach Implementierung erfolgreich.
- 128 gezielte Frontendfälle erfolgreich; nach Korrektur der älteren Test-Extraktionsgrenze weitere 106 gezielte Fälle erfolgreich.
- **`npm run build` erfolgreich.**
- **`npm test`: 1.449 Tests, 1.446 bestanden, 0 fehlgeschlagen, 3 übersprungen**, 170,92 s.
- Die drei unveränderten Auslassungen betreffen Dateisymlinks unter Windows (zwei Linux-Installerfälle, ein Anhangsfall); Verzeichnis-Junction-Abdeckung bleibt aktiv.
- Umfangreiche lokale Vorschauprüfung mit synthetischem Demokonto: Übersicht, Retouren, Produkte, Entsorgung, Scan-Erfassung, Chat und Admin, jeweils dunkle deutsche und helle englische Darstellung bei 1440 × 900 und 320 × 852. Kein gemessener horizontaler Seitenüberlauf in den 28 Kombinationen.
- Retouren- und Entsorgungsdetails bei 320 px: Dialog 279/279 px sichtbare/Scrollbreite, Inhalt 269/269 px. Reiter, Dateien, Ereignisse und gemeinsamer Kommunikationsbereich erreichbar.
- Kommentarentwurf und öffentlicher Hinweis über Reiterwechsel behalten und anschließend geleert. Dasselbe mit Entsorgungskommentar geprüft. Keine Kommentare abgeschickt und keine Kundenlinks erzeugt.
- Tastatur: Pfeiltasten und End aktivieren den passenden Reiter; Einheiten prüfen zusätzlich Home und zyklischen Wechsel. Bestehende Warnung beim Verlassen ungespeicherter Formulare bleibt aktiv.
- Mobiles Ansichtsmenü vollständig innerhalb des Viewports, kein interner horizontaler Überlauf. Benutzerkonfiguration nicht zurückgesetzt.
- Keine Warnungen/Fehler im abschließend gelesenen Browserkonsolenprotokoll.

Unabhängiges Schlussreview ohne weitere konkrete Funktions- oder Sicherheitsregression. Ein statischer Verdacht auf Abschneiden der Sticky-Reiter durch den negativen Abstand wurde im echten Browser nachgemessen: bei mobilem Scrollstand 865 lagen Scrollport und Reiterleiste beide bei 107,39 px; am Desktop bei Scrollstand 495 beide bei 120,80 px. Die erste Taste lag jeweils vollständig darunter. Der negative Abstand gleicht das Innenpadding aus; deshalb wurde diese Regel nach Prüfung beibehalten.

## Nachweise und Grenzen

Build-/Testprotokolle, aufgabenbezogener Diff und Vorher-Dateien: `.qa/interface-clarity-2026-10-28/`.
Screenshots und Messwerte: `C:\Users\Alex\.codex\visualizations\2026\10\05\01a10b8a-04dc-77c0-8111-4c536d046e6d\interface-clarity-1028`.

Kein physisches iPhone/Safari oder Screenreader getestet. Reale Drucker, Scanner und produktive OAuth-Anbieter wurden durch diesen Darstellungsauftrag nicht neu geprüft. Der Build weist weiterhin auf fehlende Betreiber-/Hostingangaben in `website/legal.json` hin; diese Aufgabe verändert die Werbeseite nicht.

Keine neue Abhängigkeit, Versionsänderung, Commit-, Push-, Release- oder Cloudaktion. Bestehende uncommittete Änderungen wurden erhalten.

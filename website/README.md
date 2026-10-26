# Produktseite für retourenboard.

Eigenständige statische Werbeseite im selben iOS-inspirierten Stil wie die Anwendung: neutrale Oberflächen, abgerundete Karten, Glasnavigation, Mintakzente und ein dezentes Punktraster. Sie verbindet sich weder mit der Anwendung noch mit einer Datenbank. Schriften, Bilder und Skripte werden lokal ausgeliefert; keine eingebetteten Tracker oder externen Widgets.

## Bilder und Produktvorschau

`src/assets/returns-studio.webp` ist eine mit dem eingebauten Imagegen-Werkzeug erzeugte Illustration für Paket, Scanner und Gerät. Die übrigen 24 WebP-Dateien zeigen Übersicht, Retourenliste und Teamchat der lokalen synthetischen Demoumgebung 4.0.70: zwölf Desktopaufnahmen und zwölf Mobilaufnahmen in einem lokal erstellten Smartphone-Rahmen, jeweils in Deutsch/Englisch und Hell/Dunkel. Alle 24 Beispielbilder werden als WebP-Dateien in **3840 × 2160 Pixeln (4K, 16:9)** eingebunden. Die Desktop-Originale werden nicht verkleinert; die Smartphone-Kompositionen sind direkt in 4K gerendert. Die tatsächlichen Smartphone-Screens bleiben im Hochformat, ohne verzerrt zu werden. Die sichtbare Variante folgt Sprache und Farbschema der Werbeseite. Die Seite bezeichnet die Produktdaten ausdrücklich als Beispieldaten. Die Retourenlisten zeigen keinen geöffneten Detaildialog.

Es werden keine Produktionsdaten oder Zugangsdaten in die öffentliche Seite übernommen. Die 24 Beispielbilder zusammen sind ungefähr 5,3 MB groß; nur die Hero-Illustration lädt priorisiert, Produktbilder laden verzögert. Die hochauflösenden Originale liegen gemeinsam unter [`docs/readme/screenshots/`](../docs/readme/screenshots/README.md): Desktop in 3840 × 2160 Pixeln, mobil in 1320 × 2868 Pixeln. [`screenshot-sources.json`](screenshot-sources.json) ordnet jede WebP-Datei ihrem README-Original zu und enthält Prüfsummen beider Dateien. Die Website lädt nur die optimierten Ableitungen; Original-JPEGs und lokale HTML-Komposition sind keine Laufzeitabhängigkeit.

Das Logo und Favicon stammen ausschließlich aus `../public/favicon.svg`. Der Build kopiert diese Datei unverändert für Navigation, Produktvorschau, Footer und Favicon. Die Produkt-Screenshots enthalten das in der Anwendung verwendete gleiche Logo.

## Bedienung und Animationen

- Einstieg mit gestaffelter Einblendung, ruhig schwebender Illustration und Scan-Lichtlinie.
- Die Produktvorschau erscheint mit einer kurzen räumlichen Bewegung und einem einmaligen Lichtreflex. Funktionskarten bauen Überschrift und Beschreibung leicht gestaffelt auf.
- Buttons, Geräte-/Ansichts- und Installations-Tabs, Workflow-Auswahl, Navigation und Kopfleisten-Schalter teilen sich Mint-Tönung, Kontur, weichen Schatten und einen kurzen Lichtreflex bei Hover oder Tastaturfokus. Auch bei ausgeschalteten Animationen bleibt das Farbfeedback sichtbar; deaktivierte Aktionen sind ausgenommen. Touchgeräte erhalten Druckfeedback ohne festhängenden Hover-Zustand. FAQ- und Textlinks bekommen passende Farb- und Fokuszustände. Symbole zeichnen sich beim Hover nach; Dokumentkarten fächern sich auf und die Chatillustration reagiert mit einer kurzen Einblendung. Die eigentlichen Klickflächen bleiben dabei an derselben Stelle.
- Der Hintergrundschein der Paketgrafik bewegt sich ruhig mit und pausiert zusammen mit der vorhandenen Szene außerhalb des sichtbaren Bereichs. Workflow-Verbindungen füllen sich passend zum gewählten Schritt.
- Die zusätzlichen Effekte verwenden CSS-Transformationen und Deckkraft, keine neue Animationsbibliothek. Die vorhandene Einstellung für reduzierte Bewegung und der Animationsschalter gelten auch für diese Effekte.
- „Animationen“ pausiert beziehungsweise aktiviert die Bewegung. Dauerhaft gespeichert wird die Auswahl nur nach Zustimmung im Speicherbanner. Ohne Auswahl gilt `prefers-reduced-motion`.
- Dekorative Dauereffekte pausieren außerhalb des Hero-Bereichs und bei ausgeblendetem Browsertab. Ohne JavaScript und bei Beobachtungsfehlern bleiben alle Inhalte sichtbar.
- Die Produktansichten und Installationsarten lassen sich per Tastatur auswählen. Das mobile Menü verwendet natives HTML und funktioniert auch ohne JavaScript. FAQ-Antworten bleiben nativ aufklappbar.
- Die Produktvorschau bietet zusätzlich „Desktop / Mobil“. Die Gerätewahl bleibt beim Wechsel zwischen Übersicht, Retouren und Team erhalten und verändert keine Anwendungseinstellungen. Ohne JavaScript bleibt die Desktopvorschau sichtbar. Das feste 16:9-Format verhindert Höhenwechsel zwischen den Beispielbildern.

## Datenschutz und Speicherwahl

Beim ersten Besuch erscheint die Speicherwahl sofort als zentrierter nativer Dialog mit abgedunkeltem, weichgezeichnetem Hintergrund. Die Seite dahinter ist währenddessen nicht bedienbar und scrollt nicht; der Tastaturfokus bleibt im Dialog. Escape oder das Schließen-Symbol schließen ihn ohne Zustimmung. Eine gespeicherte Auswahl verhindert das erneute automatische Öffnen. Der Footer kann den Dialog jederzeit erneut öffnen; nach dem Schließen erhält der Auslöser seinen Fokus zurück. Auf kleinen Bildschirmen bleibt der Dialog innerhalb des sichtbaren Bereichs und kann bei Bedarf intern scrollen.

Das Banner bietet gleichwertige Aktionen „Nur notwendige“ und „Einstellungen merken“. Vor einer Zustimmung werden die drei optionalen lokalen Schlüssel `retourenboard.website.theme`, `retourenboard.website.language` und `retourenboard.website.motion` weder gelesen noch beschrieben. Alle Bedienelemente funktionieren auch nur im Arbeitsspeicher. Bei Zustimmung werden bereits auf der Seite gewählte Einstellungen übernommen. Bei Ablehnung oder Widerruf werden ausschließlich diese drei Website-Schlüssel entfernt; andere Website-/Anwendungsdaten bleiben erhalten.

Die Entscheidung selbst wird für 180 Tage unter `retourenboard.website.privacy` gespeichert, ohne Nutzerkennung und ohne Serverübertragung. Abgelaufene Entscheidungen erlauben keine optionalen Zugriffe; alte Einstellungen werden beim nächsten Aufruf entfernt. Der Footerzugang „Cookie-Einstellungen“ erlaubt jederzeit eine neue Wahl. Eine Änderung in einem anderen Tab wird beachtet. Bei gesperrtem Browserspeicher bleibt die aktuelle Seite bedienbar. Ohne JavaScript bleibt die deutsche Seite lesbar, folgt dem Systemfarbschema und verwendet keine optionalen Speicherfunktionen.

`datenschutz.html` und `impressum.html` sind statisch und ohne JavaScript erreichbar. **Beide sind derzeit ausdrücklich Entwürfe**, weil die tatsächlichen Betreiber-/Hostingangaben noch nicht vorliegen. Öffentliche Angaben in `website/legal.json` ergänzen: Name/Firma, Anschrift als Zeilenliste, E-Mail, Hostinganbieter, Hostingland und tatsächliche Protokollierung/Speicherdauer. Zusätzliche Pflichtangaben je Rechtsform können als Klartext in `additionalLegalInformation` aufgenommen werden. Der Build prüft die Feldtypen und E-Mail und maskiert HTML. Diese Datei enthält ausschließlich für die Veröffentlichung bestimmte Angaben, keine Zugangsdaten.

Die vorhandenen Texte müssen vor Veröffentlichung mit dem realen Hosting, gegebenenfalls eingesetzten zusätzlichen Diensten und den einschlägigen Betreiberpflichten abgeglichen werden. Ein vollständiger Konfigurationssatz ist keine automatische juristische Freigabe. Änderungen an Tracking, Einbettungen oder Hosting erfordern eine erneute Prüfung der Informationen und gegebenenfalls der Einwilligungssteuerung. Technische Grundlage: [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html), [Hinweise der Datenschutzaufsicht Niedersachsen](https://www.lfd.niedersachsen.de/startseite/infothek/faqs_zur_ds_gvo/faq-telekommunikation-digitale-dienste-datenschutzgesetz-tdddg-206449.html).

## Vorschau und Build

Im Projektordner mit Node.js 24 und den vorhandenen Entwicklungsabhängigkeiten:

```sh
npm run website:build
npm run website:preview
```

Dann http://127.0.0.1:3020 öffnen. Ein anderer Port ist mit `npm run website:preview -- --port 3021` möglich. Strg+C beendet die Vorschau. Die Anwendung und ihre Anmeldung laufen auf einem eigenen Port. Nach einem erneuten Website-Build liefert die laufende Vorschau die aktuellen Inhalte bereits bekannter Dateien aus. Ein Neuladen im Browser genügt für aktualisierte Bilder, Texte und Skripte. Wenn sich die Dateinamen im Bildmanifest ändern, die Vorschau einmal neu starten.

Quellen: `src/index.html`, `src/site.css` und die kleinen TypeScript-Module für Sprache, Theme, Bewegung, Navigation und Downloads. Der Build prüft TypeScript, übernimmt die Version aus der Projekt-`package.json`, kopiert lokale Bilder nach `dist/assets/` und erzeugt ein Bildmanifest. Die Vorschau liefert ausschließlich die bekannten statischen Dateien und die im Manifest genannten Bilddateien aus; keine allgemeinen Projekt- oder API-Pfade.

`npm run build` baut auch die Produktseite. `website/dist/` ist im Linuxpaket enthalten; der Installer veröffentlicht die Werbeseite nicht automatisch.

## Veröffentlichung

Nach Ergänzung und Prüfung der Betreiberinformationen den **gesamten Inhalt von `website/dist/` einschließlich `assets/`** gemeinsam in den Webroot kopieren. Das umfasst `index.html`, `datenschutz.html`, `impressum.html`, `site.css`, `site.js`, `favicon.svg`, `kofi.avif` und das Bildverzeichnis. Nicht nur `website/src/` hochladen. Die fertige Version muss eine Zahl statt `@@VERSION@@` zeigen, und `site.js` muss mit JavaScript-Content-Type erreichbar sein. Nach einem Update gegebenenfalls den Webserver-/CDN-Cache leeren.

Relative Assetpfade erlauben eine Bereitstellung unter einem Unterpfad. Für die statische Seite selbst sind weder Node.js noch eine Datenbank nötig. Die App und die Werbeseite sollten getrennt betrieben werden. Für öffentliche Bereitstellung HTTPS und geeignete Sicherheitsheader konfigurieren; die Downloadabfrage benötigt `connect-src https://api.github.com`.

Download-Buttons ermitteln bei einem normalen Klick den neuesten veröffentlichten Release über die GitHub-API und unterstützen versionierte sowie stabile Installer-/Archivnamen. Bei Fehlern öffnet sich die Release-Seite; ohne JavaScript zeigen die Links ebenfalls dorthin. Es werden keine Downloads automatisch ausgeführt. Projekt: https://github.com/KaterBeratung/retourenboard. Die lokale Versionsnummer sagt nichts über den aktuell veröffentlichten Release aus.

Der Ko-fi-Link verwendet ein lokal gespeichertes Icon und lädt keine Widgets. Externe Ziele werden erst beim bewussten Klick geöffnet.

Die rechtlichen Links führen zu den lokalen Entwurfsseiten. Veröffentlichen und GitHub-Updates erfolgen nur auf ausdrücklichen Auftrag.

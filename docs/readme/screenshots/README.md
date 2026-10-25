# Aktuelle Beispielbilder

Originalaufnahmen aus der lokalen retourenboard.-Demo, Version **4.0.70**. Alle sichtbaren Personen, Gespräche und Bestandsdaten sind synthetische Beispieldaten. Für die Aufnahmen wurden keine Bestandsdaten angelegt, geändert oder gelöscht.

[Projektübersicht](../README.md) · [English](../README_EN.md) · [Bildmetadaten und SHA256](manifest.json)

- **Desktop: 3840 × 2160 Pixel (4K, 16:9)**, mit dem gut lesbaren Layout eines 1920 × 1080 CSS-Pixel großen Browserfensters bei zweifacher Rendergröße.
- **Mobil: 1320 × 2868 Pixel**, mit einem responsiven Layout von 440 × 956 CSS-Pixeln bei dreifacher Rendergröße. Das Bildformat entspricht der [Displayauflösung des iPhone 16 Pro Max](https://support.apple.com/en-gb/121032).

Die Anwendung wurde direkt vom Browser hochauflösend gerendert; die JPEG-Dateien wurden nicht nachträglich vergrößert. Es handelt sich um responsive Chromium-Aufnahmen mit sichtbarer Anwendungsnavigation, nicht um Aufnahmen oder einen Funktionstest auf einem echten iPhone mit Safari. Menüs, Dialoge und vorübergehende Einblendungen wurden vor der Aufnahme geschlossen und die Bilder visuell geprüft.

Übersicht, Retourenliste und Teamchat sind für Deutsch/Englisch sowie Hell/Dunkel auf Desktop und Mobil vorhanden. Produkte, Scan-Erfassung und Stammdaten ergänzen die deutschen Desktopansichten. Die ursprünglichen Dateinamen bleiben für bestehende README-Verweise erhalten.

| Bild | Ansicht | Sprache | Farbschema | Größe |
| --- | --- | --- | --- | --- |
| [admin-de.jpg](admin-de.jpg) | `/admin` | DE | dark | 3840 × 2160 |
| [chat-dark-en.jpg](chat-dark-en.jpg) | `/chat#channel-1` | EN | dark | 3840 × 2160 |
| [chat-de.jpg](chat-de.jpg) | `/chat#channel-1` | DE | dark | 3840 × 2160 |
| [chat-light-de.jpg](chat-light-de.jpg) | `/chat#channel-1` | DE | light | 3840 × 2160 |
| [chat-light-en.jpg](chat-light-en.jpg) | `/chat#channel-1` | EN | light | 3840 × 2160 |
| [mobile-chat-de.jpg](mobile-chat-de.jpg) | `/chat#channel-1` | DE | dark | 1320 × 2868 |
| [mobile-chat-en.jpg](mobile-chat-en.jpg) | `/chat#channel-1` | EN | dark | 1320 × 2868 |
| [mobile-chat-light-de.jpg](mobile-chat-light-de.jpg) | `/chat#channel-1` | DE | light | 1320 × 2868 |
| [mobile-chat-light-en.jpg](mobile-chat-light-en.jpg) | `/chat#channel-1` | EN | light | 1320 × 2868 |
| [mobile-overview-de.jpg](mobile-overview-de.jpg) | `/#overview` | DE | dark | 1320 × 2868 |
| [mobile-overview-en.jpg](mobile-overview-en.jpg) | `/#overview` | EN | dark | 1320 × 2868 |
| [mobile-overview-light-de.jpg](mobile-overview-light-de.jpg) | `/#overview` | DE | light | 1320 × 2868 |
| [mobile-overview-light-en.jpg](mobile-overview-light-en.jpg) | `/#overview` | EN | light | 1320 × 2868 |
| [mobile-returns-de.jpg](mobile-returns-de.jpg) | `/#returns` | DE | dark | 1320 × 2868 |
| [mobile-returns-en.jpg](mobile-returns-en.jpg) | `/#returns` | EN | dark | 1320 × 2868 |
| [mobile-returns-light-de.jpg](mobile-returns-light-de.jpg) | `/#returns` | DE | light | 1320 × 2868 |
| [mobile-returns-light-en.jpg](mobile-returns-light-en.jpg) | `/#returns` | EN | light | 1320 × 2868 |
| [overview-dark-de.jpg](overview-dark-de.jpg) | `/#overview` | DE | dark | 3840 × 2160 |
| [overview-dark-en.jpg](overview-dark-en.jpg) | `/#overview` | EN | dark | 3840 × 2160 |
| [overview-light-de.jpg](overview-light-de.jpg) | `/#overview` | DE | light | 3840 × 2160 |
| [overview-light-en.jpg](overview-light-en.jpg) | `/#overview` | EN | light | 3840 × 2160 |
| [products-de.jpg](products-de.jpg) | `/#products` | DE | dark | 3840 × 2160 |
| [returns-dark-en.jpg](returns-dark-en.jpg) | `/#returns` | EN | dark | 3840 × 2160 |
| [returns-de.jpg](returns-de.jpg) | `/#returns` | DE | dark | 3840 × 2160 |
| [returns-light-de.jpg](returns-light-de.jpg) | `/#returns` | DE | light | 3840 × 2160 |
| [returns-light-en.jpg](returns-light-en.jpg) | `/#returns` | EN | light | 3840 × 2160 |
| [scan-de.jpg](scan-de.jpg) | `/#scan-intake` | DE | dark | 3840 × 2160 |

## Gemeinsame Bilder für README und Werbeseite

Die Produktvorschau der Werbeseite verwendet dieselben Aufnahmen als optimierte WebP-Ableitungen. Desktopbilder behalten ihre originale Auflösung von 3840 × 2160 Pixeln. Mobile Originale bleiben unbeschnitten im bestehenden Smartphone-Rahmen; diese 16:9-Kompositionen werden ebenfalls direkt mit 3840 × 2160 Pixeln gerendert. Alle 24 WebP-Dateien der Produktvorschau sind damit in 4K eingebunden. Die Zuordnung und Prüfsummen stehen in [website/screenshot-sources.json](../../../website/screenshot-sources.json). Die unabhängige Hero-Illustration bleibt erhalten.

## Aufnahmen erneuern

Die reguläre Demo mit `npm run preview` und isolierter PostgreSQL-Testumgebung starten, mit dem dokumentierten Demokonto anmelden und die gewünschte Ansicht öffnen. Desktop mit 1920 × 1080 CSS-Pixeln bei zweifacher und mobil mit 440 × 956 CSS-Pixeln bei dreifacher Rendergröße aufnehmen. Hochauflösend rendern, statt vorhandene Bilder hochzuskalieren. Sprache, Farbschema, Route, tatsächliche Bildabmessungen, Rendergröße, Aufnahmezeit und SHA256 im Manifest aktualisieren. Das Logo stammt unverändert aus `public/favicon.svg`.

Vor einer Aufnahme des Dokumentanfangs ganz nach oben scrollen und die Scrollposition `0` prüfen. Ein Bildausschnitt ab Dokumentkoordinate `y: 0` bei bereits gescrollter Seite kann angeheftete Leisten an falscher Stelle abbilden. Bei gescrollten Motiven den tatsächlichen sichtbaren Bereich aufnehmen. Vor dem Speichern Such-/Schnellmenüleiste, untere Navigation, offene Menüs, Dialoge, Fokus- und Tooltip-Einblendungen sowie die Bildabmessungen kontrollieren. Unterschiedliche Aufnahmeversionen und Zeitpunkte am jeweiligen Bildeintrag im Manifest vermerken. Anschließend die zugehörigen WebP-Dateien und deren Quellenmanifest gemeinsam erneuern.

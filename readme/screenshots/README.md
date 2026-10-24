# Aktuelle Beispielbilder

Originalaufnahmen aus der lokalen retourenboard.-Demo, Version **4.0.65**. Die mobile Retourenliste (`mobile-returns-de.jpg`) wurde mit Version **4.0.67** erneuert. Alle sichtbaren Personen, Gespräche und Bestandsdaten sind synthetische Beispieldaten. Keine Kundendaten und keine grafisch erfundene Produktoberfläche.

[Projektübersicht](../README.md) · [English](../README_EN.md) · [Bildmetadaten und SHA256](manifest.json)

Desktopaufnahmen: **1920 × 1080 Pixel (16:9)**. Mobile Aufnahmen: **390 × 844 Pixel (Hochformat)**. Unveränderte JPEG-Aufnahmen mit Kontext und Navigation. Alle Motive wurden visuell kontrolliert; für die Aufnahme wurden keine Bestandsdaten angelegt, geändert oder gelöscht.

| Bild | Ansicht | Sprache | Farbschema | Größe |
| --- | --- | --- | --- | --- |
| [overview-dark-de.jpg](overview-dark-de.jpg) | /#overview | DE | dark | 1920 × 1080 |
| [returns-de.jpg](returns-de.jpg) | /#returns | DE | dark | 1920 × 1080 |
| [products-de.jpg](products-de.jpg) | /#products | DE | dark | 1920 × 1080 |
| [scan-de.jpg](scan-de.jpg) | /#scan-intake | DE | dark | 1920 × 1080 |
| [chat-de.jpg](chat-de.jpg) | /chat | DE | dark | 1920 × 1080 |
| [admin-de.jpg](admin-de.jpg) | /admin#masterdata | DE | dark | 1920 × 1080 |
| [overview-light-de.jpg](overview-light-de.jpg) | /#overview | DE | light | 1920 × 1080 |
| [overview-light-en.jpg](overview-light-en.jpg) | /#overview | EN | light | 1920 × 1080 |
| [overview-dark-en.jpg](overview-dark-en.jpg) | /#overview | EN | dark | 1920 × 1080 |
| [mobile-overview-en.jpg](mobile-overview-en.jpg) | /#overview | EN | dark | 390 × 844 |
| [mobile-overview-de.jpg](mobile-overview-de.jpg) | /#overview | DE | dark | 390 × 844 |
| [mobile-returns-de.jpg](mobile-returns-de.jpg) | /#returns | DE | dark | 390 × 844 |
| [mobile-chat-de.jpg](mobile-chat-de.jpg) | /chat | DE | dark | 390 × 844 |

## Aufnahmen erneuern

Die reguläre Demo mit `npm run preview` und isolierter PostgreSQL-Testumgebung starten, mit dem dokumentierten Demokonto anmelden und die gewünschte Ansicht öffnen. Desktop im 16:9-Format und Mobilansichten im Hochformat aufnehmen. Ladezustände und Dialoge vor der Aufnahme schließen, sofern sie nicht das Motiv sind; Sprache, Farbschema, Dateiname und Prüfsumme im Manifest aktualisieren. Das Logo stammt unverändert aus `public/favicon.svg`.

Vor einer Aufnahme des Dokumentanfangs ganz nach oben scrollen und prüfen, dass die Scrollposition tatsächlich `0` ist. Ein Bildausschnitt ab Dokumentkoordinate `y: 0` bei bereits gescrollter Seite bildet angeheftete Leisten an falscher Stelle ab. Bei gescrollten Motiven den tatsächlichen sichtbaren Bereich aufnehmen. Vor dem Speichern Such-/Schnellmenüleiste, untere Navigation, Fokus- und Tooltip-Einblendungen sowie die Bildabmessungen kontrollieren. Abweichende Aufnahmeversionen und Zeitpunkte am jeweiligen Bildeintrag im Manifest vermerken.

<div align="center">

# retourenboard.

**Ein Ort für alle Rückläufer.**

Produkte verwalten, Retouren erfassen und im Team zusammenarbeiten – übersichtlich, modern und selbst gehostet.

</div>

<p align="center">
  <img src="readme_assets/overview-hero.png" alt="Übersicht von retourenboard" width="100%">
</p>

## Warum retourenboard?

retourenboard. bündelt **Produkte**, **Retouren**, **Scan-Erfassung**, **Team-Kommunikation** und **Stammdaten** in einer gemeinsamen Oberfläche. Die Anwendung ist für den **Selbsthosting-Betrieb** gedacht und eignet sich für interne Retouren- und Prüfprozesse.

### Highlights

- **Zentrale Übersicht** über offene, laufende und abgeschlossene Vorgänge
- **Produkte & Retouren** in einer gemeinsamen, klaren Datenstruktur
- **Scan-Erfassung** für schnelle Aufnahme von Geräten und Seriennummern
- **Teamchat & Zusammenarbeit** direkt in der Anwendung
- **Stammdaten & Regeln** für einheitliche Prozesse
- **CSV-Import / CSV-Export** für Datenaustausch und Massenpflege
- **Selbst hostbar** mit Docker Compose oder klassisch auf Linux

> **Hinweis:** Die folgenden Bilder sind anonymisierte Demo-Ansichten. Namen und sensible Werte wurden bewusst ersetzt.

---

## Funktionsübersicht

| Bereich | Beschreibung |
| --- | --- |
| Übersicht | Kennzahlen, aktuelle Rückläufer und schneller Einstieg in den Arbeitsalltag |
| Retouren | Erfassung, Filterung und Bearbeitung von Rückläufern mit Status und Gründen |
| Produkte | Gemeinsamer Produktbestand mit Kategorien, Lieferanten und Preisen |
| Scan-Erfassung | Aufnahme neuer Geräte per Seriennummer, Kamera, Foto oder PDF |
| Chat | Teamkommunikation, Gruppen und Dateianhänge direkt im System |
| Stammdaten | Pflege von Lieferanten, Herstellern, Kategorien, Gründen, Zuständen und Statuswerten |
| Administration | Benutzerkonten, Sicherungen, Benachrichtigungen und weitere Verwaltung |

---

## Screenshots

### Übersicht

<p>
  <img src="readme_assets/overview-hero.png" alt="Übersicht" width="100%">
</p>

### Retouren

<p>
  <img src="readme_assets/returns-top.png" alt="Retourenbereich" width="100%">
</p>

### Produkte

<p>
  <img src="readme_assets/products.png" alt="Produktübersicht" width="100%">
</p>

### Scan-Erfassung

<p>
  <img src="readme_assets/scan.png" alt="Scan-Erfassung" width="100%">
</p>

### Chat

<p>
  <img src="readme_assets/chat.png" alt="Teamchat" width="100%">
</p>

### Stammdaten

<p>
  <img src="readme_assets/masterdata.png" alt="Stammdaten" width="100%">
</p>

---

## Schnellstart mit Docker Compose

Voraussetzung: **Docker** und **Docker Compose** sind installiert.

```bash
docker compose up -d --build
```

Danach ist retourenboard. standardmäßig unter folgender Adresse erreichbar:

```text
http://SERVER-IP:3000
```

### Nützliche Befehle

```bash
# Container starten / aktualisieren
docker compose up -d --build

# Status prüfen
docker compose ps

# Logs ansehen
docker compose logs -f retourenboard

# Container stoppen
docker compose down
```

### Datenhaltung

Die Anwendung sollte mit **persistenten Daten** betrieben werden, damit Datenbank, Uploads und Sicherungen erhalten bleiben. Die bereitgestellte `compose.yaml` verwendet dafür ein dauerhaftes Volume.

---

## Erste Schritte

1. Anwendung starten
2. Im Browser öffnen
3. Erstes Administratorkonto anlegen
4. Stammdaten pflegen
5. Produkte anlegen oder importieren
6. Retouren erfassen und im Team bearbeiten

---

## Typische Einsatzbereiche

- Interne Retouren- und Prüfprozesse
- Verwaltung von Rückläufern im Lager oder Service
- Dokumentation von Zuständen, Gründen und Lösungen
- Gemeinsame Bearbeitung durch mehrere Mitarbeitende
- Strukturierte Geräteerfassung mit Seriennummern

---

## Technische Basis

- **Backend:** Node.js
- **Frontend:** Web-Oberfläche
- **Datenbank:** SQLite
- **Betrieb:** Selbsthosted, z. B. per Docker Compose oder Linux-Installation

---

## Hinweise

- Diese README zeigt absichtlich **keine feste Versionsnummer** im Bildmaterial.
- Die Screenshots wurden für die Dokumentation anonymisiert.
- Für produktive Nutzung empfiehlt sich ein Reverse Proxy mit HTTPS.

---

## Support / Projekt

Wenn du retourenboard. intern oder öffentlich bereitstellst, empfiehlt sich zusätzlich:

- regelmäßige Backups
- abgesicherter Zugriff
- HTTPS per Reverse Proxy
- klare Benutzer- und Rechteverwaltung


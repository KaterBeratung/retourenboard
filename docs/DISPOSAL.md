# Vernichtung, Datenlöschung und Entsorgung

Der Bereich **Entsorgung** erfasst einzelne physische Geräte. Ein Produktkatalogeintrag oder eine Retoure ist optional. Die Maßnahme betrifft die angegebene Seriennummer beziehungsweise Gerätekennung; sie archiviert oder löscht keinen Produktkatalogeintrag und ändert keinen Retourenstatus.

## Ablauf

1. **Neuer Geräteauftrag:** Gerät und Kennung eingeben oder die Kennung scannen. Optional Angaben über die dauerhaft sichtbare Produktsuche aus dem Katalog übernehmen. Über die Aktionen einer Retoure oder eines Produkts lässt sich ein Auftrag bereits mit dessen Angaben öffnen.
2. **Vorgemerkt:** Maßnahme, Grund, Lagerort, Referenz und Notizen prüfen. Bis zur Freigabe lässt sich der Auftrag bearbeiten. Für dieselbe Kennung kann nur ein offener Auftrag bestehen.
3. **Freigegeben:** Ein berechtigtes Konto gibt den Auftrag frei. Die tatsächliche Vernichtung, Löschung oder Entsorgung erfolgt außerhalb der Anwendung.
4. **Durchgeführt:** Datum, Verfahren und ausführende Person beziehungsweise Dienstleister dokumentieren. Die Anwendung hält zusätzlich fest, wer freigegeben und dokumentiert hat.

Offene Aufträge können mit Begründung storniert werden. Ein abgeschlossener Nachweis lässt sich mit Begründung korrigieren; frühere Angaben bleiben als eigene Revisionen im Verlauf gespeichert. Gleichzeitige Bearbeitungen werden durch eine Revisionsprüfung abgesichert.

## Verbindung zur Retoure

Die Retourendetails zeigen verknüpfte Aufträge und ihren Status. Offene Aufträge verhindern standardmäßig einen verfrühten Retourenabschluss. Nach der Durchführung öffnet **Retourenabschluss vorbereiten** die Abschlussprüfung der verknüpften Retoure; erst ausdrückliches Speichern schließt sie ab. Zu bereits abgeschlossenen Retouren sind keine neuen offenen Aufträge möglich. Einzelheiten: [Retourenworkflow](RETURN-WORKFLOW.md).

## Etiketten und Nachweise

Vor der Durchführung gibt es ein **Auftragsetikett**, danach einen **Vernichtungs-, Löschungs- oder Entsorgungsnachweis**. Zur Auswahl stehen A4, 103 × 164 mm, 62 × 29 mm und das allgemeine Drucklayout. Für einen vollständigen Nachweis startet die Vorschau auf A4. Das kleine Format dient der Kurzkennzeichnung mit Auftragsnummer, Gerät, Kennung, Status und bei Abschluss Datum und Revision. Die Vorschau blockiert den Druck, wenn der Inhalt nicht vollständig passt.

Der QR-Code enthält ausschließlich die DIS-Auftragsnummer. Sie kann nach Anmeldung über die globale Suche oder den Scanner aufgelöst werden. Im Druckerdialog das passende Papierformat, 100 % / tatsächliche Größe sowie deaktivierte Browser-Kopf- und Fußzeilen wählen.

Die Angaben dokumentieren die erfasste Durchführung. Die Anwendung führt keine Datenlöschung oder Hardwarevernichtung aus und stellt kein extern geprüftes Zertifikat aus.

## Berechtigungen

Lesen, Anlegen, Bearbeiten/Stornieren, Freigeben, Durchführung dokumentieren, Export/Druck und Import sind einzeln vergebbar. Administratoren besitzen alle Rechte. Mitarbeiter können standardmäßig lesen, anlegen, bearbeiten und exportieren; Freigabe, Durchführung und Import müssen ausdrücklich vergeben werden. Betrachter können standardmäßig lesen. Für jede weitere Aktion ist zusätzlich das Leserecht erforderlich. Eine Nachweiskorrektur benötigt sowohl Bearbeiten als auch Durchführung dokumentieren.

## Datenaustausch und Sicherungen

Der Bereich verwendet einen eigenen JSON-Export einschließlich Historie. Beim Import wird zuerst geprüft und eine Vorschau angezeigt; erst die Bestätigung übernimmt alle Einträge gemeinsam. Bereits vorhandene Auftragsnummern und doppelte offene Gerätekennungen werden abgewiesen. Bestehende Nachweise werden nicht überschrieben. Der Import benötigt auch die Rechte für die in der Historie enthaltenen Freigaben und Durchführungen.

Produktverknüpfungen werden über die Artikelnummer, Retourenverknüpfungen über Retourennummer und passende Seriennummer neu zugeordnet. Fehlt ein passender Eintrag im Zielbestand, bleiben Gerätename, Kennung und historische Angaben erhalten. Historische Personennamen werden übernommen; fremde Konto-IDs nicht.

Vollsicherungen enthalten Geräteaufträge und alle Revisionen. Die additive PostgreSQL-Schemaerweiterung erhält bestehende Bestandsdaten. Alte PostgreSQL-Sicherungen und SQLite-Übernahmen bleiben lesbar; sie enthalten noch keine Geräteaufträge. Zurück auf Version 4.0.0 lässt sich eine neue Sicherung mit diesen zusätzlichen Tabellen nicht einspielen.

## English

**Disposal** manages individual devices with or without a catalog product or return. Create a draft order, approve it, then record the actual completion date, method and operator. Open orders can be cancelled with a reason. Corrections to completed records require a reason and retain previous revisions.

Print an order label before completion or a completion record afterwards. A4, 103 × 164 mm, 62 × 29 mm and the general layout are supported. Small labels are short identifiers; use A4 for the full record. The QR contains only the DIS order number. Actual erasure or disposal takes place outside the application.

Access, creation, editing, approval, completion, printing/export and import have separate permissions. JSON exports retain order history; imports preview and validate all records before an atomic commit. Full backups include all orders and revisions. Older backups and SQLite migrations remain supported.

# SSO / OpenID Connect

Die Oberfläche heißt **OAuth / OpenID**. Die Anmeldung verwendet OpenID Connect (OIDC) auf Basis von OAuth 2.0; reine OAuth-Anbieter ohne OIDC werden nicht unterstützt. Der globale Schalter wird beim Speichern in einem separaten Dialog mit Adminpasswort und gegebenenfalls 2FA bestätigt. Abbrechen erhält die gewählte Einstellung als ungespeicherten Entwurf.

SSO ergänzt die lokale Anmeldung. Unterstützt werden Microsoft Entra ID und
konfigurierbare OpenID-Connect-Anbieter mit Authorization Code Flow, PKCE S256 und
RS256-signierten ID-Tokens. Es werden ausschließlich `openid profile email` angefordert.
Graph-Zugriff, automatische Kontoanlage und globale Microsoft-Abmeldung sind nicht enthalten.

## Aktivieren und deaktivieren

1. Lokal als Administrator anmelden und **Adminbereich → OAuth / OpenID** öffnen.
2. Eine öffentliche HTTPS-Adresse in den Servereinstellungen hinterlegen. Falls dort
   ein Neustart angezeigt wird, diesen zunächst durchführen.
3. Einen Anbieter zunächst **deaktiviert** speichern. Dadurch erhält er seine feste Callback-Adresse.
4. Diese Adresse beim Anbieter als **Web-Redirect-URI** registrieren.
5. Discovery mit **Verbindung prüfen** kontrollieren. Die Prüfung bestätigt erreichbare
   Metadaten und Endpunkte; Client-Secret und Benutzerlogin werden erst beim echten Login geprüft.
6. Den einzelnen Anbieter aktivieren, dann den zentralen Schalter **SSO aktivieren** speichern.

Beide Schalter müssen eingeschaltet sein. Standardmäßig ist die gesamte Funktion aus.
Beim Ausschalten bleiben Anbieter und Kontoverknüpfungen gespeichert. Laufende Anmeldungen
werden ungültig. Sitzungen verknüpfter Konten werden beendet, einschließlich ihrer lokalen
Sitzungen; die lokale Anmeldung bleibt anschließend möglich.

Die vorhandenen lokalen Administratoren und deren Passwörter bleiben erhalten. Jeder kann
weiterhin sein vorhandenes lokales Passwort verwenden. Ein ausschließlich über SSO nutzbarer
Kontotyp ist in dieser Version nicht vorgesehen.

## Microsoft Entra ID

- Eine App-Registrierung im eigenen Tenant anlegen; Plattform **Web** verwenden.
- Die konkrete **Verzeichnis-/Tenant-ID** und **Anwendungs-/Client-ID** eintragen.
- Ein Client-Secret erzeugen und dessen **Wert** im Retourenboard-Dialog hinterlegen.
  Die Secret-ID ist nicht der Secret-Wert. Secrets niemals über den Supportchat übermitteln.
- Die angezeigte Callback-Adresse exakt eintragen, etwa
  `https://retouren.example.org/api/sso/callback/<Anbieter-ID>`.
- Die Vorlage verwendet `https://login.microsoftonline.com/<Tenant-ID>/v2.0`.
  Gemeinsame Microsoft-Autoritäten wie `common` werden nicht akzeptiert.
- `client_secret_post` ist die Voreinstellung der Microsoft-Vorlage.
- Verwendet wird der Code-Flow; Implicit-/Hybrid-Flow und Graph-Berechtigungen werden nicht benötigt.

Mehrere Microsoft-Tenants sind als getrennte, ausdrücklich eingerichtete Anbieter möglich.
Issuer, Client-ID und Anbietertyp eines gespeicherten Anbieters bleiben unveränderlich.
Für deren Wechsel wird ein neuer Anbieter mit neuen Freigaben angelegt.

## Andere OIDC-Anbieter

- Typ **OpenID Connect** wählen.
- Den vollständigen exakten Issuer einschließlich eines Realm-Pfads und gegebenenfalls
  abschließendem Schrägstrich eingeben, z. B. `https://identity.example.org/realms/team`.
- Einen vertraulichen Web-Client mit Authorization Code Flow, PKCE S256, RS256 und
  `client_secret_basic` oder `client_secret_post` einrichten.
- Discovery, Token- und JWKS-Endpunkte müssen per HTTPS erreichbar sein. Zertifikate
  werden geprüft. HTTP ist ausschließlich für explizit eingerichtete lokale Testfixtures erlaubt.
- Liegen Endpunkte auf einer anderen Origin als der Issuer, diese Origin ausdrücklich
  unter **Zusätzlich erlaubte Endpoint-Origins** eintragen. Keine Pfade, eine Origin pro Zeile.

## Mitarbeiter freigeben

1. Das Retourenboard-Konto über die vorhandene Benutzerverwaltung mit den gewünschten
   Rechten anlegen. Bereits vorhandene Konten werden weiterverwendet.
2. Die Person meldet sich über den Anbieter an. Zunächst wird nur ihre Identität bestätigt;
   Geschäftsdaten bleiben gesperrt.
3. Im SSO-Adminbereich erscheint eine **Freigabeanfrage**. Issuer und Subject prüfen und
   die Person unabhängig von gemeldetem Namen/E-Mail identifizieren.
4. **Freigeben** wählen und bewusst das passende aktive Retourenboard-Konto auswählen.
5. Die Person meldet sich erneut über den Anbieter an. Rechte, Anzeigename und Historie
   stammen weiterhin aus diesem lokalen Konto. Bestehende lokale 2FA wird ebenfalls verlangt.

E-Mail-Gleichheit, Benutzername, externe Gruppen oder Rollen reichen nie für eine Verknüpfung.
Offene und abgelehnte Anfragen verfallen nach sieben Tagen. Eine abgelehnte Identität kann
innerhalb dieses Zeitraums keine neue Anfrage erzeugen. Verknüpfungen können unabhängig
vom lokalen Konto entzogen werden. Kontolöschung entfernt auch ihre SSO-Zuordnungen.

## Sicherungen und Schlüssel

Anbieter und Identitätszuordnungen gehören zur PostgreSQL-Sicherung. Client-Secrets sind
mit einem eigenen Schlüssel verschlüsselt. Die Datei `<DATA_DIR>/secrets/oidc.key` liegt
wie die bisherigen Schlüssel **außerhalb des normalen Backup-Archivs** und muss separat
mit restriktiven Dateirechten gesichert werden. Sie darf nicht veröffentlicht werden.

Nach einer Wiederherstellung ohne passenden Schlüssel funktioniert die lokale Anmeldung.
SSO bleibt geschlossen. Im Adminbereich erscheint die Möglichkeit **SSO-Secrets zurücksetzen**:
Nach ausdrücklicher Bestätigung werden SSO und alle Anbieter ausgeschaltet und ihre Secrets
entfernt; die Verknüpfungen bleiben erhalten. Danach die Secrets erneut hinterlegen und
Anbieter sowie zentrale Funktion wieder aktivieren. Ein bestehender Schlüssel wird nie
automatisch ersetzt.

Portable Sicherungsformate 1–3 und alte SQLite-Importe bleiben lesbar; sie enthalten zunächst
keine SSO-Anbieter. Neue Sicherungen verwenden portables Schema 4 / PostgreSQL-Migration 5.
Offene Anmeldevorgänge und Provider-Tokens werden nicht gesichert.

## Betrieb und Abnahme

- Abmelden beendet die Retourenboard-Sitzung. Die Sitzung beim Anbieter bleibt bestehen.
- Nach einem Serverneustart muss eine laufende Anmeldung neu gestartet werden.
- Die bestehende Laufzeitlease erlaubt eine aktive Anwendungsinstanz pro Datenbankschema.
- Code-Austausch und Tokenprüfung laufen serverseitig; keine Provider-Tokens im Browserstorage.
- Callback-URLs, Tokens und Secrets sollten auch im Reverse-Proxy-Zugriffsprotokoll nicht
  aufgezeichnet werden. Für den Callback-Pfad Querystrings im Proxy-Logging ausnehmen.
- Lokal wird mit einem synthetischen Anbieter und echten signierten Tokens getestet.
  Ein produktiver Microsoft-/Keycloak-Login erfordert die eigene registrierte Client-Anwendung
  und bleibt Bestandteil der Einrichtung durch den Betreiber.

Protokollgrundlagen: [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html),
[Microsoft Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[openid-client](https://github.com/panva/openid-client).

## English

SSO is optional and disabled by default. Configure it under **Administration → OAuth / OpenID**.
Both the global switch and the individual provider switch must be enabled. Local password
sign-in remains available, including existing local MFA and recovery codes.
The name refers to OpenID Connect (OIDC) on top of OAuth 2.0; providers without OIDC are not
supported. Saving the global setting opens a separate confirmation dialog for the administrator's
password and, if enabled, MFA. Cancelling preserves the unsaved setting.

1. Configure the public HTTPS application address in server settings and restart if indicated.
2. Add a provider with its switch initially off. For Microsoft Entra ID, use a concrete tenant
   GUID, application/client ID and client secret **value**, with a **Web** app registration.
   For other providers, use the exact issuer URL and a confidential OIDC web client supporting
   Authorization Code Flow, PKCE S256, RS256 and client_secret_basic or client_secret_post.
3. Save the provider and register its generated callback URL exactly with the identity provider.
4. Check discovery/endpoints, enable the provider, then enable SSO globally. Connection checks
   do not verify the secret or a real user login. Only explicitly listed extra endpoint origins
   are allowed; production endpoints require HTTPS with certificate validation.
5. Create or retain the person's existing Retourenboard account and its intended permissions.
   Their first external sign-in creates a pending access request, without access to business data.
6. Independently verify the issuer/subject identity, approve it, and explicitly select the correct
   existing active account. Email/name equality never links accounts automatically. The person
   signs in again and completes their existing local MFA if configured or required.

Disabling SSO invalidates pending sign-ins and sessions of linked accounts, including their local
sessions. Configuration and account links remain saved; local sign-in is still possible. Removing
a link similarly revokes the account's sessions without deleting its data. Signing out only ends
the Retourenboard session, not the provider session. A server restart requires restarting pending
SSO sign-ins; this application supports one active runtime per database schema.

Back up `<DATA_DIR>/secrets/oidc.key` separately with restricted permissions. Normal backup archives
contain encrypted provider settings and account links but exclude encryption keys. After restoring
without a matching key, local sign-in works and SSO fails closed. **Reset SSO secrets** explicitly
disables SSO/providers and clears their secrets while preserving links. Re-enter secrets before
enabling them again. Portable backup schemas 1–3 and legacy SQLite imports remain compatible;
new exports use portable schema 4 / PostgreSQL migration 5.

Do not log callback query strings at the reverse proxy. Tokens are validated server-side and never
stored in browser storage. Automated and local browser tests use a synthetic signing provider;
your own Microsoft/other provider registration still needs an actual deployment acceptance test.

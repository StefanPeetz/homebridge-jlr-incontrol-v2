# Changelog

## [2.2.2] — 2026-06-09

### Fixed
- `clientId` und `applicationId` getrennt. Smartcar verwendet zwei verschiedene IDs:
  - **Application ID** (UUID, z.B. `548f3955-...`): wird für die Connect OAuth URL
    als `client_id`-Parameter benötigt.
  - **API Client ID** (`client_01…`): wird für den `client_credentials` Token-Abruf
    verwendet.
  Bisher wurde dieselbe ID für beides verwendet, was bei einer ID zum Fehler
  `400: Invalid parameter client_id` führte.

### Migration
- Neues Pflichtfeld `applicationId` in den Plugin-Einstellungen einfügen:
  Smartcar Dashboard → Configuration → Application details → Application ID (UUID)

## [2.2.1] — 2026-06-09
- response_type=code zur Connect-URL hinzugefügt.

## [2.2.0] — 2026-06-09
- Lokaler Callback-Server entfernt, userId wird manuell in Config eingetragen.

## [2.1.4] — 2026-06-09
- Leere server.js um MODULE_NOT_FOUND zu beheben.

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

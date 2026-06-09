# Changelog

## [2.2.3] — 2026-06-09

### Fixed
- `client_credentials` Token-Request verwendet jetzt HTTP Basic Auth
  (`Authorization: Basic base64(clientId:clientSecret)`) statt Body-Parametern.
  Smartcar IAM verlangt Basic Auth — Body-only führte zu HTTP 401.
- Detaillierte Fehler-Logs für Token-Fehler und API-Calls hinzugefügt
  (Status-Code + Response-Body werden jetzt geloggt).

## [2.2.2] — 2026-06-09
- `clientId` und `applicationId` getrennt (UUID vs. client_01…).

## [2.2.1] — 2026-06-09
- `response_type=code` zur Connect-URL hinzugefügt.

## [2.2.0] — 2026-06-09
- Lokaler Callback-Server entfernt, userId manuell in Config.

## [2.1.4] — 2026-06-09
- Leere server.js um MODULE_NOT_FOUND zu beheben.

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

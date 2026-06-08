# Changelog

## [2.1.1] — 2026-06-08

### Fixed
- `response_type=code` aus der Connect-URL entfernt. Dieser Parameter aktivierte
  den OAuth Authorization Code Flow (?code=...) statt des nativen Smartcar Connect
  Flows (?user_id=...). Redirect kam deshalb ohne Parameter an.
- `customUiPath` in package.json ergänzt — ohne diesen Eintrag ignoriert Homebridge
  das `homebridge-ui/` Verzeichnis komplett.
- Server lauscht jetzt auf `localhost` statt `127.0.0.1` (Smartcar erlaubt
  http:// Redirect URIs nur für den Hostnamen `localhost`).

## [2.1.0] — 2026-06-08
### Added
- Custom UI mit Connect-Button, Verbindungsstatus und Fahrzeugliste.

## [2.0.0] — 2026-06-08
### Changed
- Komplettes Redesign auf offiziellen Smartcar V3 Backend-Tutorial Flow.
- managementToken entfernt, userId wird automatisch nach Connect gespeichert.
- Discovery über GET /v3/connections.

## [1.2.1] — 2026-06-05
- Removed strict mode=live filter.

## [1.0.8] — 2026-06-05
- Initial public release.

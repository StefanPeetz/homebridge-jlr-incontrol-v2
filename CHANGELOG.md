# Changelog

## [2.1.2] — 2026-06-09

### Fixed
- `"customUi": true` in `config.schema.json` ergänzt (Root-Ebene, neben `pluginAlias`).
  Ohne diesen Eintrag zeigt Homebridge kein Custom-UI-Tab, auch wenn `customUiPath`
  in `package.json` korrekt gesetzt ist.

## [2.1.1] — 2026-06-08

### Fixed
- `response_type=code` aus der Connect-URL entfernt.
- `customUiPath` in `package.json` ergänzt.
- Server lauscht auf `localhost` statt `127.0.0.1`.
- Redirect-Handler verarbeitet jetzt auch POST-Body und JSON.

## [2.1.0] — 2026-06-08
### Added
- Custom UI mit Connect-Button, Verbindungsstatus und Fahrzeugliste.

## [2.0.0] — 2026-06-08
### Changed
- Komplettes Redesign auf Smartcar V3 Backend-Tutorial Flow.

## [1.0.8] — 2026-06-05
- Initial public release.

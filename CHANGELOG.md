# Changelog

## [2.1.4] — 2026-06-09

### Fixed
- `homebridge-ui/server.js` war noch im Paket enthalten und versuchte
  `@homebridge/plugin-ui-utils` zu laden, das nicht mehr als Dependency
  gelistet war. Dies verursachte `MODULE_NOT_FOUND` beim Plugin-Start.
- `server.js` und `public/index.html` auf leere Platzhalter reduziert
  damit Homebridge keine Fehler wirft.

## [2.1.3] — 2026-06-09
- Custom UI entfernt (config.schema.json, package.json bereinigt).

## [2.1.2] — 2026-06-09
- `customUi: true` zu config.schema.json hinzugefügt (rückgängig gemacht).

## [2.1.1] — 2026-06-08
- `response_type=code` aus Connect-URL entfernt.
- Server lauscht auf `localhost` statt `127.0.0.1`.

## [2.1.0] — 2026-06-08
- Custom UI hinzugefügt (rückgängig gemacht in 2.1.3/2.1.4).

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

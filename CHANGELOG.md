# Changelog

## [1.0.6] - 2026-06-05

### Fixed
- Auth-URL verwendet jetzt `application_id` statt `client_id` — das war die eigentliche Ursache des `400: Invalid parameter client_id`
- Default mode ist jetzt `live` (war `test`)
- Token-Exchange und Refresh bleiben bei HTTP Basic Auth mit clientId/clientSecret (korrekt)

## [1.0.5] - 2026-06-05
### Fixed
- `smartcarMode` konfigurierbar (test/live)

## [1.0.4] - 2026-06-05
### Fixed
- TypeScript Build: JlrPlatform → JlrSmartcarPlatform, VehicleAccessory Konstruktor

## [1.0.3] - 2026-06-05
### Fixed
- hostIp für Raspberry Pi Auth-URL

## [1.0.0] - 2026-06-05
### Breaking
- Migration von direkter JLR API zu Smartcar

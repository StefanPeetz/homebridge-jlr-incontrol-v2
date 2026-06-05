# Changelog

## [1.0.5] - 2026-06-05

### Fixed
- `smartcarMode` (test/live) jetzt konfigurierbar statt hardcoded `live`
- Default ist `test` – verhindert den `400: Invalid parameter client_id` Fehler
- `config.schema.json`: Dropdown für `smartcarMode` mit Erklärung
- Log zeigt aktiven Modus beim Start

### Warum war es falsch?
- Smartcar-Apps starten immer im Test-Mode
- Mit `mode=live` im Auth-URL lehnt Smartcar Test-App-Credentials mit 400 ab
- Auf Live umstellen: Smartcar Dashboard → App → "Go Live" beantragen → dann `smartcarMode: "live"` setzen

## [1.0.4] - 2026-06-05
### Fixed
- TypeScript Build: JlrPlatform → JlrSmartcarPlatform, VehicleAccessory Konstruktor

## [1.0.3] - 2026-06-05
### Fixed
- hostIp für Raspberry Pi Auth-URL

## [1.0.0] - 2026-06-05
### Breaking
- Migration von direkter JLR API zu Smartcar

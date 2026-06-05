# Changelog

## [1.0.8] - 2026-06-05
### Fixed
- `VehicleAccessory` Konstruktor korrekt mit 4 Argumenten aufgerufen
- Polling wird separat via `startPolling()` gestartet
- TypeScript Build-Fehler TS2554 behoben

## [1.0.7] - 2026-06-05
### Breaking / Migration
- **Vollständige Migration auf Smartcar API V3**
- Token: OAuth Code Exchange → `client_credentials` gegen `iam.smartcar.com`
- API Base: `api.smartcar.com/v2.0` → `vehicle.api.smartcar.com/v3`
- Neuer `sc-user-id` Header bei allen API-Requests
- Session speichert nur noch `userId` (kein Refresh Token mehr)
- Connect Flow bleibt **einmalig** nötig um `userId` zu erhalten
- Alte Session-Datei löschen: `rm ~/.homebridge/smartcar-tokens.json`

## [1.0.0] - 2026-06-05
### Breaking
- Migration von direkter JLR API zu Smartcar

# Changelog

## [1.0.7] - 2026-06-05

### Breaking / Migration
- **Vollständige Migration auf Smartcar API V3**
- Token: OAuth Code Exchange → `client_credentials` gegen `iam.smartcar.com`
- API Base: `api.smartcar.com/v2.0` → `vehicle.api.smartcar.com/v3`
- Neuer `sc-user-id` Header bei allen API-Requests
- Session speichert nur noch `userId` (kein Refresh Token mehr)
- Connect Flow bleibt **einmalig** nötig um `userId` zu erhalten
- Alte Session-Datei löschen: `rm ~/.homebridge/smartcar-tokens.json`
- `smartcarMode` Config-Option entfernt (immer `live`)

### Fixed
- Kompatibilität mit neuem Smartcar `client_01...` Client-ID-Format

## [1.0.6] - 2026-06-05
### Fixed
- `application_id` vs `client_id` Korrektur in Auth-URL

## [1.0.5] - 2026-06-05
### Fixed
- `smartcarMode` konfigurierbar

## [1.0.0] - 2026-06-05
### Breaking
- Migration von direkter JLR API zu Smartcar

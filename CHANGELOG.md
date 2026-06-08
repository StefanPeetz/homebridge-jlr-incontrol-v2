# Changelog

## [2.0.0] — 2026-06-08

### Breaking Changes
- `managementToken` Config-Feld entfernt — nicht mehr benötigt.
- `userId` wird nicht mehr manuell eingetragen; er wird automatisch nach dem Connect-Flow gespeichert.

### Changed
- **Komplettes Redesign der Smartcar-Anbindung** basierend auf dem offiziellen
  [Smartcar V3 Backend-Tutorial](https://smartcar.com/docs/getting-started/tutorials/backend).
- Einmaliger **Smartcar Connect-Flow**: Der Nutzer öffnet einmal die Connect-URL im Browser,
  meldet sich mit seinen Fahrzeug-Zugangsdaten an, und Homebridge empfängt die `user_id`
  automatisch über einen lokalen Callback-Server (`http://127.0.0.1:52625/exchange`).
- **Vehicle Discovery** jetzt über `GET /v3/connections` → `vehicleId` (offizielles Tutorial-Muster),
  nicht mehr direkt über `/v3/vehicles`.
- `user_id` wird dauerhaft in `.smartcar_user_id` im Homebridge-Storage-Verzeichnis gespeichert;
  nach dem ersten Connect ist kein erneuter Login nötig.
- App-Token wird per `client_credentials` geholt und automatisch alle 55 Minuten erneuert.

### Removed
- `managementToken` Config-Feld
- Abhängigkeit von der Management API

## [1.2.1] — 2026-06-05
- Removed strict `mode === 'live'` filter in `resolveUserId`.

## [1.2.0] — 2026-06-05
- `managementToken` config field, auto-resolution of `userId` via Management API.

## [1.1.0] — 2026-06-05
- Removed broken OAuth Connect flow. Added manual `userId`.

## [1.0.8] — 2026-06-05
- Initial public release.

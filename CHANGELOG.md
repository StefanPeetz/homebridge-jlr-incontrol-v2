# Changelog

## [2.1.3] — 2026-06-09

### Fixed
- Custom UI vollständig entfernt. Der `server.js` lief in einem eigenen Node-Prozess
  getrennt von Homebridge und hatte keinen Zugriff auf die Plattform-Instanz, was
  dazu führte dass die Plugin-Settings dauerhaft luden ohne je zu reagieren.
- `customUi: true` und `customUiPath` aus Schema/package.json entfernt.
- Standard-Konfigurationsformular ist wieder vollständig funktionsfähig.

### How to connect
Der Connect-Flow läuft weiterhin automatisch beim Homebridge-Start:
1. Plugin starten → Connect-URL erscheint im Log
2. URL im Browser öffnen → JLR-Login → Weiterleitung zu localhost:52625
3. user_id wird gespeichert, Fahrzeug erscheint in HomeKit

## [2.1.2] — 2026-06-09
- `customUi: true` zu config.schema.json hinzugefügt (rückgängig gemacht in 2.1.3).

## [2.1.1] — 2026-06-08
- `response_type=code` aus Connect-URL entfernt.
- Server lauscht auf `localhost` statt `127.0.0.1`.

## [2.1.0] — 2026-06-08
- Custom UI hinzugefügt (rückgängig gemacht in 2.1.3).

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

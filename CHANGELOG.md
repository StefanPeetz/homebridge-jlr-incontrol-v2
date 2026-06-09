# Changelog

## [2.3.0] — 2026-06-09

### Added
- **Auto-Plan-Erkennung**: Der effektive Plan wird automatisch aus den erteilten
  OAuth-Permissions des Fahrzeugs abgeleitet (`auto`, Standard).
  - `free`     → nur `read_vehicle_info` → keine Signal-Daten
  - `basic`    → + VIN, Odometer
  - `standard` → + Location, Charge, Fuel, Range
  - `full`     → + Lock/Unlock Commands
- **Config-Option `smartcarPlan`**: Manueller Override falls die Auto-Erkennung
  nicht passt. Werte: `auto` | `free` | `basic` | `standard` | `full`.
- Config-Schema aktualisiert mit Dropdown für `smartcarPlan`.
- Klare Warnung im Log wenn Fahrzeug nur Free-Plan-Permissions hat.

### Fixed
- Kein unnötiger Signal-Request mehr wenn Plan `free` ist.

## [2.2.6] — 2026-06-09
- /signals Endpunkt statt REST-Einzelpfade.

## [2.2.5] — 2026-06-09
- /connections Response-Format korrigiert.

## [2.2.4] — 2026-06-09
- Volles /connections Response geloggt.

## [2.2.3] — 2026-06-09
- HTTP Basic Auth für Token-Request.

## [2.2.2] — 2026-06-09
- clientId und applicationId getrennt.

## [2.2.1] — 2026-06-09
- response_type=code zur Connect-URL hinzugefügt.

## [2.2.0] — 2026-06-09
- Lokaler Callback-Server entfernt.

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

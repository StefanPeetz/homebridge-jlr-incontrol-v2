# Changelog

## [2.2.5] — 2026-06-09

### Fixed
- `/connections` Response-Format korrigiert. Smartcar V3 gibt `data: [...]` zurück,
  nicht `connections: [...]`. VehicleId steckt in
  `data[].relationships.vehicle.data.id`.
- Berechtigungen werden pro Fahrzeug geloggt.
- Warnung wenn Fahrzeug nur mit unvollständigen Berechtigungen verbunden ist.

### Hinweis: Fahrzeug neu verbinden
Das Fahrzeug wurde bisher nur mit `read_vehicle_info` verbunden — alle anderen
Berechtigungen fehlen ("No permissions" im Dashboard).
Bitte das Fahrzeug im Smartcar Dashboard disconnecten und dann den Connect-Flow
erneut durchführen, damit alle Scopes erteilt werden.

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

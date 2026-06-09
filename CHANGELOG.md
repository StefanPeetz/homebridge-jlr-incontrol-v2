# Changelog

## [2.2.6] — 2026-06-09

### Fixed
- Smartcar V3 verwendet `/signals` statt REST-Einzel-Endpunkte.
  `/charge`, `/location`, `/odometer`, `/security` existieren in V3 nicht
  mehr und gaben `INVALID_PATH 404` zurück.
- Alle Fahrzeugdaten werden jetzt per `POST /vehicles/:id/signals` in
  einem einzigen Request abgefragt.
- Lock/Unlock verwendet jetzt `POST /vehicles/:id/commands` mit `LOCK_DOORS`
  / `UNLOCK_DOORS` statt dem alten `/security` Pfad.
- Signal-Namen auf V3 Schema angepasst (z.B. `TractionBattery.StateOfCharge
  .Displayed`, `InternalCombustionEngine.FuelLevel`, `Closure.IsLocked`).

### Hinweis
Die meisten Signals benötigen einen Smartcar-Plan mit erweiterten
Berechtigungen. Mit dem Free-Plan steht nur `read_vehicle_info` zur
Veefügung, d.h. Fahrzeugdaten werden als `undefined` zurückgegeben.

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

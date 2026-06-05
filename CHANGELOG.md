# Changelog

## [1.0.4] - 2026-06-05

### Fixed
- TypeScript build: `JlrPlatform` → `JlrSmartcarPlatform` in `index.ts` und `vehicle-accessory.ts`
- `VehicleAccessory` Konstruktor-Signatur: 4. Parameter ist `JlrVehicleSummary` (nicht `Logger`)
- `platform.ts`: `VehicleAccessory`-Aufrufe übergeben korrekt `vehicle` als 4. Argument
- `startPolling` wird jetzt in `discoverDevices` aufgerufen
- Log-Zugriff in `VehicleAccessory` via `this.platform.log`

## [1.0.3] - 2026-06-05

### Fixed
- `hostIp` config option: Auth-URL und `redirect_uri` verwenden die konfigurierte Pi-IP
- `config.schema.json`: Neues Feld `hostIp` mit Beschreibung

## [1.0.2] - 2026-06-05

### Fixed
- Clean release trigger after CI workflow fixes

## [1.0.1] - 2026-06-05

### Fixed
- `peerDependencies` jetzt `^1.6.0 || ^2.0.0` — kompatibel mit Homebridge 2.x

## [1.0.0] - 2026-06-05

### Breaking change
- Migrated from direct JLR API (broken since 2024) to **Smartcar API**
- Plugin renamed to `homebridge-jlr-smartcar`

### Added
- OAuth 2.0 flow, Lock/Unlock, Battery, Fuel, Range, Odometer, Location

### Removed
- Direct JLR IFAS/IFOP/IF9 auth, Climate/preconditioning

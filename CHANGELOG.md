# Changelog

## [1.0.3] - 2026-06-05

### Fixed
- `hostIp` config option: Auth-URL im Log und `redirect_uri` verwenden jetzt die konfigurierte
  IP des Raspberry Pi statt `localhost` — nötig wenn der Browser nicht auf dem Pi läuft
- `config.schema.json`: Neues Pflichtfeld-UI für `hostIp` mit Beschreibung
- `redirectUri` bleibt als manueller Override möglich (Reverse-Proxy-Setups)

## [1.0.2] - 2026-06-05

### Fixed
- Clean release trigger after CI workflow fixes

## [1.0.1] - 2026-06-05

### Fixed
- `peerDependencies` jetzt `^1.6.0 || ^2.0.0` — kompatibel mit Homebridge 2.x
- `devDependencies` auf Homebridge 2.1.0 aktualisiert

## [1.0.0] - 2026-06-05

### Breaking change
- Migrated from direct JLR API (broken since 2024) to **Smartcar API**
- JLR now requires OTP/Passkey — direct password auth is no longer possible
- Plugin renamed to `homebridge-jlr-smartcar`

### Added
- OAuth 2.0 flow via built-in HTTP server (port 52625)
- One-time browser auth at `http://<hostIp>:52625/auth`
- Automatic token refresh — no re-auth after initial setup
- Lock / Unlock via Smartcar security endpoint
- Battery level, charging state, low battery alert
- Fuel level (PHEV / ICE)
- Range in km, Odometer in km, Location
- Configurable poll interval (default 300s)

### Removed
- Direct JLR IFAS/IFOP/IF9 auth (no longer functional)
- Climate / preconditioning (not available via Smartcar)

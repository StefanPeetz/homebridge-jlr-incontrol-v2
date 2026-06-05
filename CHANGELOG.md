# Changelog

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
- One-time browser auth at `http://homebridge-ip:52625/auth`
- Automatic token refresh — no re-auth after initial setup
- Lock / Unlock via Smartcar security endpoint
- Battery level, charging state, low battery alert
- Fuel level (PHEV / ICE)
- Range in km
- Odometer in km
- Location (latitude / longitude)
- Configurable poll interval (default 300s)
- GitHub Actions: CI build on every push/PR
- GitHub Actions: automatic npm publish on GitHub Release

### Removed
- Direct JLR IFAS/IFOP/IF9 auth (no longer functional)
- Climate / preconditioning (not available via Smartcar)

# Changelog

## [1.1.0] – 2026-06-05

### Breaking Change
- Removed the built-in OAuth Connect server (port 52625).
  The `client_01…` Client ID used by Smartcar V3 is a `client_credentials`
  credential and **cannot** be used in the browser-based Connect flow.

### Added
- New required config field: `userId`.
  Obtain it once from the Smartcar Dashboard → Connections and paste it
  into the plugin config. No further logins are needed.
- Custom UI (`homebridge-ui`): step-by-step instructions + live connection
  test (calls the Smartcar API directly to verify credentials).

### Removed
- Local HTTP server on port 52625 (OAuth redirect listener).
- `redirectUri` and `hostIp` config fields (no longer needed).
- Token file (`smartcar-session.json`) – state is now fully in-memory.

## [1.0.8] – 2026-06-05
- Initial public release (OAuth flow – broken with V3 client_01 IDs).

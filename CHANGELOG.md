# Changelog

## [1.2.0] – 2026-06-05

### Added
- `managementToken` config field (Application Management Token from Smartcar Dashboard).
- Auto-resolution of `userId` via `GET /v2.0/management/connections` on startup.
  No manual copy-paste of userId required anymore.
- Custom UI: live connection test resolves userId and verifies vehicle access.

### Removed
- Manual `userId` is now optional (kept as override only).
- `hostIp`, `redirectUri` config fields (not needed).

## [1.1.0] – 2026-06-05
- Removed broken OAuth Connect flow (client_01… IDs not accepted by Connect).
- Added manual `userId` config field as workaround.

## [1.0.8] – 2026-06-05
- Initial public release (OAuth flow – broken with V3 client_01 IDs).

# Changelog

## [1.2.1] – 2026-06-05

### Fixed
- Removed strict `mode === 'live'` filter in `resolveUserId`.
  Now prefers live connections but falls back to any available connection.
- Added detailed logging of all connections returned by the Management API
  to make debugging easier.

## [1.2.0] – 2026-06-05

### Added
- `managementToken` config field (Application Management Token from Smartcar Dashboard).
- Auto-resolution of `userId` via `GET /v2.0/management/connections` on startup.
- Custom UI: live connection test resolves userId and verifies vehicle access.

## [1.1.0] – 2026-06-05
- Removed broken OAuth Connect flow.
- Added manual `userId` config field as workaround.

## [1.0.8] – 2026-06-05
- Initial public release.

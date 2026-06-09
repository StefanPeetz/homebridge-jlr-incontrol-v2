# Changelog

## [2.2.1] — 2026-06-09

### Fixed
- `response_type=code` zur Connect-URL hinzugefügt. Smartcar verlangt diesen
  Parameter zwingend und liefert sonst den Fehler:
  `400: Missing required parameter: "response_type"`
- Nach dem Login leitet Smartcar zu:
  `http://localhost:52625/exchange?code=...&user_id=XXXX-...`
  Der `user_id`-Wert ist in der Adressleiste sichtbar und wird manuell
  in das Konfigurationsfeld "Smartcar User ID" eingetragen.

## [2.2.0] — 2026-06-09
- Lokaler Callback-Server entfernt, userId wird manuell in Config eingetragen.

## [2.1.4] — 2026-06-09
- Leere server.js um MODULE_NOT_FOUND zu beheben.

## [2.1.3] — 2026-06-09
- Custom UI entfernt.

## [2.1.1] — 2026-06-08
- response_type=code aus Connect-URL entfernt (Rücknahme in 2.2.1).
- Server auf localhost umgestellt.

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

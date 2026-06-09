# Changelog

## [2.2.0] — 2026-06-09

### Changed
- Lokaler Callback-Server komplett entfernt. Der Server lief auf dem Homebridge-Host,
  aber `localhost` im Browser zeigt auf den Rechner des Nutzers — der Redirect kam
  deshalb nie beim Plugin an.
- Neuer Flow: Connect-URL wird im Log ausgegeben. Nach dem JLR-Login zeigt der Browser
  die `user_id` in der Adressleiste. Diese wird einmalig in den Plugin-Einstellungen
  unter "Smartcar User ID" eingetragen.
- Neues Pflichtfeld `userId` im Config-Schema ergänzt.
- `homebridge-ui/` Verzeichnis und alle Custom-UI Abhängigkeiten entfernt.

### How to connect
1. Plugin starten → Connect-URL erscheint im Homebridge-Log
2. URL im Browser öffnen → JLR InControl Login
3. Nach dem Login: Adressleiste zeigt `...?user_id=XXXX-...`
4. Wert von `user_id=` kopieren
5. In Plugin-Einstellungen unter "Smartcar User ID" eintragen
6. Speichern & Homebridge neu starten

## [2.1.4] — 2026-06-09
- Leere server.js um MODULE_NOT_FOUND Fehler zu beheben.

## [2.1.3] — 2026-06-09
- Custom UI entfernt (config.schema bereinigt).

## [2.1.2] — 2026-06-09
- customUi: true zu config.schema hinzugefügt.

## [2.1.1] — 2026-06-08
- response_type=code aus Connect-URL entfernt.
- Server lauscht auf localhost statt 127.0.0.1.

## [2.0.0] — 2026-06-08
- Redesign auf Smartcar V3 flow.

## [1.0.8] — 2026-06-05
- Initial public release.

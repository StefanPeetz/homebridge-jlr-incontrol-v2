# homebridge-jlr-smartcar

[![npm](https://img.shields.io/npm/v/homebridge-jlr-smartcar.svg)](https://www.npmjs.com/package/homebridge-jlr-smartcar)
[![Homebridge](https://img.shields.io/badge/homebridge-%E2%89%A51.6.0-blueviolet)](https://homebridge.io)

Homebridge-Plugin für **Jaguar Land Rover InControl** über die [Smartcar API V3](https://smartcar.com).

## Features

- 🔒 Türen sperren / entsperren über Apple Home
- 🔋 Akkustand & Ladezustand (EV)
- ⛽ Tankstand
- 📍 Standort & Kilometerstand
- 🔄 Automatisches Polling (konfigurierbar)

---

## Voraussetzungen

1. **Smartcar-Account** anlegen unter [dashboard.smartcar.com](https://dashboard.smartcar.com)
2. Eine neue Anwendung erstellen und folgende **Redirect URI** eintragen:
   ```
   http://127.0.0.1:52625/exchange
   ```
3. **Client ID** und **Client Secret** aus dem Dashboard notieren.

---

## Installation

### Über Homebridge UI (empfohlen)

Suche in der Homebridge Plugin-Suche nach `homebridge-jlr-smartcar` und installiere das Plugin.

### Manuell

```bash
npm install -g homebridge-jlr-smartcar
```

---

## Konfiguration

Trage in den Plugin-Einstellungen (oder direkt in `config.json`) ein:

```json
{
  "platform": "JlrSmartcarPlatform",
  "name": "JLR",
  "clientId": "client_01…",
  "clientSecret": "dein-secret",
  "pollIntervalSeconds": 60
}
```

| Feld | Pflicht | Beschreibung |
|------|---------|-------------|
| `clientId` | ✅ | Smartcar Client ID (beginnt mit `client_01…`) |
| `clientSecret` | ✅ | Smartcar Client Secret |
| `pollIntervalSeconds` | ❌ | Abfrageintervall in Sekunden (Standard: 60, Min: 30) |

---

## Fahrzeug verbinden (einmalig)

Das Plugin nutzt den offiziellen **Smartcar Connect-Flow**:

1. Starte Homebridge nach der Konfiguration.
2. Im Homebridge-Log erscheint:
   ```
   [JLR InControl] Kein userId gefunden. Bitte verbinde dein Fahrzeug...
   [Smartcar Connect] Callback-Server lauscht auf http://127.0.0.1:52625/exchange
   ```
3. Öffne die **Connect-URL** im Browser. Diese wird im Log angezeigt oder ist über die Plugin-UI abrufbar.
4. Melde dich mit deinen **JLR InControl-Zugangsdaten** an und erteile die Berechtigungen.
5. Nach erfolgreicher Verbindung erscheint eine Bestätigungsseite im Browser.
6. Homebridge erkennt das Fahrzeug automatisch — **kein Neustart nötig**.

Die `user_id` wird dauerhaft gespeichert. Bei einem Neustart von Homebridge ist kein erneuter Connect-Flow nötig.

---

## Technischer Ablauf

```
1. Plugin startet lokalen HTTP-Server auf Port 52625
2. Nutzer öffnet Smartcar Connect URL im Browser
3. Nutzer meldet sich mit JLR-Zugangsdaten an
4. Smartcar leitet weiter zu:
   http://127.0.0.1:52625/exchange?user_id=<uuid>
5. Plugin speichert user_id dauerhaft
6. Discovery: GET /v3/connections → vehicleId-Liste
7. Fahrzeugdaten: GET /v3/vehicles/:id
8. App-Token per client_credentials (automatisch erneuert)
```

Basiert auf dem offiziellen [Smartcar V3 Backend-Tutorial](https://smartcar.com/docs/getting-started/tutorials/backend).

---

## Redirect URI im Smartcar Dashboard

Diese URI muss **exakt** im Smartcar Dashboard eingetragen sein:

```
http://127.0.0.1:52625/exchange
```

> **Dashboard** → deine App → **Redirect URIs** → hinzufügen

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `No userId` im Log | Connect-Flow noch nicht durchgeführt |
| `401 Unauthorized` | Client ID / Secret falsch, oder Redirect URI nicht eingetragen |
| Port 52625 belegt | Anderen Prozess beenden; Port ist konfigurierbar (zukünftiges Feature) |
| Fahrzeug nicht erkannt | Prüfe ob JLR InControl aktiv ist und das Fahrzeug kompatibel ist |

---

## Lizenz

MIT © StefanPeetz

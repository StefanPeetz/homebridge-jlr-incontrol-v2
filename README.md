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
2. Neue Anwendung erstellen und folgende **Redirect URI** eintragen:
   ```
   http://localhost:52625/exchange
   ```
   > ⚠️ Smartcar erlaubt `http://` (unverschlüsselt) nur für den Hostnamen `localhost` — nicht für `127.0.0.1`.
3. **Client ID** und **Client Secret** aus dem Dashboard notieren.

---

## Installation

```bash
npm install -g homebridge-jlr-smartcar
```

Oder über die Homebridge Plugin-Suche.

---

## Konfiguration

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
| `clientId` | ✅ | Smartcar Client ID (`client_01…`) |
| `clientSecret` | ✅ | Smartcar Client Secret |
| `pollIntervalSeconds` | ❌ | Abfrageintervall in Sekunden (Standard: 60, Min: 30) |

---

## Fahrzeug verbinden (einmalig)

1. Homebridge starten — im Log erscheint die **Connect-URL**.
2. URL im Browser öffnen.
3. Mit **JLR InControl-Zugangsdaten** anmelden und Berechtigungen erteilen.
4. Erfolgsseite erscheint — Homebridge verbindet automatisch.

Die `user_id` wird dauerhaft gespeichert. Kein erneuter Connect nach Neustart nötig.

---

## Technischer Ablauf

```
1. Plugin startet lokalen HTTP-Server auf localhost:52625
2. Nutzer öffnet Smartcar Connect URL im Browser
3. Nutzer meldet sich mit JLR-Zugangsdaten an
4. Smartcar leitet weiter zu:
   http://localhost:52625/exchange?user_id=<uuid>
5. Plugin speichert user_id dauerhaft
6. Discovery: GET /v3/connections → vehicleId-Liste
7. App-Token per client_credentials (auto-refresh alle 55 min)
```

---

## Redirect URI im Smartcar Dashboard

Muss **exakt** so eingetragen sein:

```
http://localhost:52625/exchange
```

> ⚠️ `http://127.0.0.1:52625/exchange` wird von Smartcar abgelehnt!

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `No userId` im Log | Connect-Flow noch nicht durchgeführt |
| `401 Unauthorized` | Client ID / Secret falsch |
| Redirect URI abgelehnt | Muss `localhost` sein, nicht `127.0.0.1` |
| Port 52625 belegt | Anderen Prozess auf Port 52625 beenden |

---

## Lizenz

MIT © StefanPeetz

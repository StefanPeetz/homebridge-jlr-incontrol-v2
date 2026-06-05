# homebridge-jlr-smartcar

Homebridge plugin for **Jaguar Land Rover** vehicles via the [Smartcar API V3](https://smartcar.com).

## Features

- 🔒 Lock / Unlock via HomeKit
- 🔋 Battery level & charging state (EVs)
- ⛽ Fuel level (combustion engines)
- 📍 Location & motion detection
- 🛣️ Odometer
- 🔄 Automatic token refresh – no periodic re-login needed

## Requirements

- Homebridge ≥ 1.6.0
- Node.js ≥ 18
- A [Smartcar developer account](https://dashboard.smartcar.com) with your JLR vehicle connected

## Setup

### 1 – Connect your vehicle (one-time)

Connect your JLR vehicle once via [Smartcar Connect](https://smartcar.com/docs/getting-started/connect-your-vehicle). You can use the Smartcar developer playground for this.

### 2 – Get your credentials

From [dashboard.smartcar.com](https://dashboard.smartcar.com) → your app:

| Field | Where to find |
|---|---|
| **Client ID** | *API credentials* section |
| **Client Secret** | *API credentials* section |
| **Application Management Token** | *Application Configuration* section |

> **No userId needed** – it is resolved automatically via the Management Token.

### 3 – Configure the plugin

```json
{
  "platform": "JlrSmartcarPlatform",
  "name": "JLR Smartcar",
  "clientId": "client_01…",
  "clientSecret": "your-secret",
  "managementToken": "your-management-token",
  "pollIntervalSeconds": 60
}
```

### 4 – Restart Homebridge

Your JLR vehicle appears in HomeKit within seconds.

## How it works

1. On startup, the plugin calls `GET /v2.0/management/connections` with your Management Token to resolve the `userId` automatically.
2. An **app-level access token** is fetched via `client_credentials` (auto-refreshed).
3. Every API call passes the resolved `userId` in the `sc-user-id` header.

## Troubleshooting

| Problem | Solution |
|---|---|
| `managementToken fehlt` | Add `managementToken` to your config. |
| `No live connections found` | Connect your vehicle at [connect.smartcar.com](https://connect.smartcar.com) first. |
| `401 Unauthorized` | Check your `clientId` and `clientSecret`. |
| Vehicle not updating | Lower `pollIntervalSeconds` (min 30 s). |

## License

MIT

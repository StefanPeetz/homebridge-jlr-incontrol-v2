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

### 1 – Create a Smartcar App

1. Go to [dashboard.smartcar.com](https://dashboard.smartcar.com) and create an app.
2. Note down your **Client ID** and **Client Secret** from *API credentials*.

### 2 – Connect your vehicle (one-time)

Smartcar V3 uses a **user-level connection** that you create once via the Smartcar Connect flow. The easiest way to do this is through the [Smartcar developer playground](https://smartcar.com/docs/getting-started/connect-your-vehicle).

After connecting:
1. Open [dashboard.smartcar.com](https://dashboard.smartcar.com) → **Connections** (or *Users & Connections*).
2. Select your user entry.
3. Copy the **User ID** (format: `sc_user_…` or a UUID).

### 3 – Configure the plugin

Add to your Homebridge `config.json`:

```json
{
  "platform": "JlrSmartcarPlatform",
  "name": "JLR Smartcar",
  "clientId": "client_01…",
  "clientSecret": "your-secret",
  "userId": "sc_user_…",
  "pollIntervalSeconds": 60
}
```

| Field | Description |
|---|---|
| `clientId` | Smartcar V3 Client ID |
| `clientSecret` | Smartcar Client Secret |
| `userId` | Smartcar User ID (from Dashboard → Connections) |
| `pollIntervalSeconds` | How often to refresh vehicle data (min 30 s, default 60 s) |
| `notifyWebhookUrl` | *(optional)* Webhook URL for state-change notifications |

### 4 – Restart Homebridge

After saving the config, restart Homebridge. Your JLR vehicle should appear in HomeKit within a few seconds.

## How it works

This plugin uses **Smartcar API V3** exclusively:

- An **app-level access token** is obtained via `client_credentials` (auto-refreshed, no user interaction).
- Every API call passes your **User ID** in the `sc-user-id` header.
- No OAuth browser flow is required after the initial one-time vehicle connection.

## Troubleshooting

| Problem | Solution |
|---|---|
| `userId is missing from config` | Add the `userId` field to your config (see step 2). |
| `401 Unauthorized` | Check your `clientId` and `clientSecret`. |
| `404 / no vehicles found` | Make sure your vehicle is connected in the Smartcar Dashboard. |
| Vehicle not updating | Lower `pollIntervalSeconds` (min 30 s). |

## License

MIT

# homebridge-jlr-incontrol-v2

Homebridge plugin for **Jaguar Land Rover InControl** – now powered by the [Smartcar API](https://smartcar.com) since JLR has blocked direct API access.

## Why Smartcar?

JLR deprecated their unofficial password-based API in 2024 and now requires OTP/Passkey for all logins. Smartcar holds an official JLR integration and provides a stable OAuth 2.0 API. The free tier allows 500 calls/month (~1 poll every 90 minutes).

## Supported features

| Feature | Status |
|---|---|
| Lock / Unlock | ✅ |
| Battery level (EV/PHEV) | ✅ |
| Charging status | ✅ |
| Fuel level | ✅ |
| Range (km) | ✅ |
| Odometer | ✅ |
| Location | ✅ |
| Climate / Preconditioning | ❌ Not available via Smartcar |

## Setup

### 1. Create a Smartcar app (free)

1. Go to [dashboard.smartcar.com](https://dashboard.smartcar.com) and create an account
2. Create a new application
3. Add `http://localhost:52625/callback` to your **Redirect URIs**
4. Copy your **Client ID** and **Client Secret**

### 2. Install the plugin

```bash
npm install -g homebridge-jlr-incontrol-v2
```

### 3. Configure Homebridge

Add to your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "JlrInControl",
      "name": "JLR InControl",
      "clientId": "YOUR_SMARTCAR_CLIENT_ID",
      "clientSecret": "YOUR_SMARTCAR_CLIENT_SECRET",
      "pollIntervalSeconds": 300
    }
  ]
}
```

### 4. Authorize your vehicle (one-time)

On first start, Homebridge logs will show:

```
[Smartcar] ACTION REQUIRED: Open this URL in your browser:
[Smartcar]   http://localhost:52625/auth
```

Open that URL, log in with your JLR account, authorize the app. Done – tokens are saved automatically and refresh silently.

## Smartcar pricing

| Tier | Calls/month | Cost |
|---|---|---|
| Free | 500 | $0 |
| Starter | Unlimited | $2.99/month |

With 500 free calls and a 300s poll interval you get ~72h of coverage/month. For daily use the Starter plan is recommended.

## Building from source

```bash
npm install
npm run build
```

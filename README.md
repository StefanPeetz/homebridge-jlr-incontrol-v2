# homebridge-jlr-smartcar

[![npm](https://img.shields.io/npm/v/homebridge-jlr-smartcar)](https://www.npmjs.com/package/homebridge-jlr-smartcar)
[![CI](https://github.com/StefanPeetz/homebridge-jlr-incontrol-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanPeetz/homebridge-jlr-incontrol-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Homebridge plugin for **Jaguar Land Rover InControl** – powered by the [Smartcar API](https://smartcar.com).

> **Why Smartcar?**  
> JLR deprecated their unofficial password-based API in 2024 and now requires OTP/Passkey for all logins, making direct automation impossible. Smartcar holds an official JLR partnership and provides a stable OAuth 2.0 API.

## Supported features

| Feature | Status |
|---|---|
| Lock / Unlock | ✅ |
| Battery level (EV/PHEV) | ✅ |
| Charging status | ✅ |
| Low battery alert | ✅ |
| Fuel level | ✅ |
| Range (km) | ✅ |
| Odometer | ✅ |
| Location | ✅ |
| Climate / Preconditioning | ❌ Not available via Smartcar |

## Installation

```bash
npm install -g homebridge-jlr-smartcar
```

Or install via the **Homebridge UI** by searching for `homebridge-jlr-smartcar`.

## Setup

### 1. Create a free Smartcar app

1. Go to [dashboard.smartcar.com](https://dashboard.smartcar.com) and sign up
2. Create a new application
3. Add `http://localhost:52625/callback` to **Redirect URIs**
4. Note your **Client ID** and **Client Secret**

### 2. Configure Homebridge

Add to `config.json`:

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

### 3. Authorize your vehicle (one-time)

Restart Homebridge. The logs will show:

```
[Smartcar] ACTION REQUIRED: Open this URL in your browser:
[Smartcar]   http://localhost:52625/auth
```

Open that URL → log in with your JLR account → authorize. Tokens are saved to `~/.homebridge/smartcar-tokens.json` and refresh automatically – no repeat login needed.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | string | **required** | Smartcar Client ID |
| `clientSecret` | string | **required** | Smartcar Client Secret |
| `redirectUri` | string | `http://localhost:52625/callback` | Must match your Smartcar app settings |
| `pin` | string | | Vehicle PIN (reserved for future use) |
| `pollIntervalSeconds` | integer | `300` | How often to poll vehicle state (min: 60) |

## Smartcar pricing

| Tier | Calls/month | Price |
|---|---|---|
| Free | 500 | $0 |
| Starter | Unlimited | $2.99 / month |

At 300s poll interval: ~8,640 calls/month → Starter plan recommended for daily use.  
At 1800s (30 min): ~1,440 calls/month → fits within free tier.

## Building from source

```bash
git clone https://github.com/StefanPeetz/homebridge-jlr-incontrol-v2.git
cd homebridge-jlr-incontrol-v2
npm install
npm run build
```

## Releasing a new version

1. Bump `version` in `package.json`
2. Commit and push to `main`
3. GitHub Actions auto-creates the Git tag
4. Create a **GitHub Release** from that tag
5. The `publish.yml` workflow automatically publishes to npm

> **Prerequisite:** Add your npm token as a repository secret named `NPM_TOKEN`  
> (GitHub repo → Settings → Secrets → Actions → New secret)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT

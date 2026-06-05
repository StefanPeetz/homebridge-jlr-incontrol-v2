import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import axios from 'axios';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';

class JlrUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/test-connection', (body: { clientId: string; clientSecret: string; userId: string }) =>
      this.handleTestConnection(body),
    );
    this.ready();
  }

  private async handleTestConnection(body: { clientId: string; clientSecret: string; userId: string }) {
    const { clientId, clientSecret, userId } = body;

    if (!clientId || !clientSecret || !userId) {
      return { ok: false, message: 'clientId, clientSecret und userId sind alle erforderlich.' };
    }

    try {
      // 1. Fetch app token
      const tokenResp = await axios.post(
        SMARTCAR_IAM_URL,
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const appToken: string = tokenResp.data.access_token;

      // 2. Fetch vehicles
      const vehiclesResp = await axios.get<{ vehicles: string[] }>(`${SMARTCAR_API_BASE}/vehicles`, {
        headers: { Authorization: `Bearer ${appToken}`, 'sc-user-id': userId },
      });
      const count = vehiclesResp.data.vehicles?.length ?? 0;

      return { ok: true, message: `✅ Verbindung erfolgreich! ${count} Fahrzeug(e) gefunden.` };
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string }; status?: number }; message?: string })
        ?.response?.data?.message ?? (err as Error)?.message ?? 'Unbekannter Fehler';
      return { ok: false, message: `❌ Fehler: ${msg}` };
    }
  }
}

(() => new JlrUiServer())();

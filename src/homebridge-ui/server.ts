import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import axios from 'axios';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';
const SMARTCAR_MGMT_URL = 'https://management.smartcar.com/v2.0/management/connections';

class JlrUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/test-connection', (body: {
      clientId: string;
      clientSecret: string;
      managementToken: string;
    }) => this.handleTestConnection(body));
    this.ready();
  }

  private async handleTestConnection(body: { clientId: string; clientSecret: string; managementToken: string }) {
    const { clientId, clientSecret, managementToken } = body;

    if (!clientId || !clientSecret || !managementToken) {
      return { ok: false, message: 'Bitte alle drei Felder ausfüllen.' };
    }

    try {
      // 1. Resolve userId via Management API
      const auth = Buffer.from(`default:${managementToken}`).toString('base64');
      const mgmtResp = await axios.get<{ connections: { userId: string; vehicleId: string; mode: string }[] }>(
        SMARTCAR_MGMT_URL,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      const live = (mgmtResp.data.connections ?? []).filter(c => c.mode === 'live');
      if (live.length === 0) {
        return { ok: false, message: '❌ Keine live-Verbindungen gefunden. Fahrzeug zuerst über connect.smartcar.com verbinden.' };
      }
      const userId = live[0].userId;

      // 2. Fetch app token
      const tokenResp = await axios.post(
        SMARTCAR_IAM_URL,
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const appToken: string = tokenResp.data.access_token;

      // 3. Fetch vehicles
      const vehiclesResp = await axios.get<{ vehicles: string[] }>(`${SMARTCAR_API_BASE}/vehicles`, {
        headers: { Authorization: `Bearer ${appToken}`, 'sc-user-id': userId },
      });
      const count = vehiclesResp.data.vehicles?.length ?? 0;

      return {
        ok: true,
        message: `✅ Verbindung erfolgreich! userId: ${userId} — ${count} Fahrzeug(e) gefunden.`,
      };
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ?? (err as Error)?.message ?? 'Unbekannter Fehler';
      return { ok: false, message: `❌ Fehler: ${msg}` };
    }
  }
}

(() => new JlrUiServer())();
